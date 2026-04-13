"""Tests for DAG rule flow ordering (topological sort from trigger)."""

from __future__ import annotations

from app.database.models.rule import Rule, RuleStep
from app.services.rule_flow import (
    RULE_TRIGGER_NODE_ID,
    ancestor_step_ids_sorted,
    ordered_steps_from_flow,
)


def _step(sid: str, oi: int, name: str = "S") -> RuleStep:
    return RuleStep(
        id=sid,
        rule_id="rule-1",
        order_index=oi,
        name=name,
        step_type="llm_prompt",
        config={},
    )


def test_fallback_order_index_when_no_layout():
    rule = Rule()
    a, b = _step("a", 1), _step("b", 0)
    rule.steps = [a, b]
    rule.flow_layout = None
    ordered, err = ordered_steps_from_flow(rule)
    assert err is None
    assert [s.id for s in ordered] == ["b", "a"]


def test_linear_path_from_edges():
    rule = Rule()
    rule.steps = [_step("x", 0), _step("y", 1)]
    rule.flow_layout = {
        "nodes": [],
        "edges": [
            {"id": "e1", "source": RULE_TRIGGER_NODE_ID, "target": "y"},
            {"id": "e2", "source": "y", "target": "x"},
        ],
    }
    ordered, err = ordered_steps_from_flow(rule)
    assert err is None
    assert [s.id for s in ordered] == ["y", "x"]


def test_fan_out_from_trigger():
    """Trigger connects to both a and b; both run (order deterministic by id)."""
    rule = Rule()
    rule.steps = [_step("a", 0), _step("b", 1)]
    rule.flow_layout = {
        "edges": [
            {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
            {"source": RULE_TRIGGER_NODE_ID, "target": "b"},
        ],
    }
    ordered, err = ordered_steps_from_flow(rule)
    assert err is None
    assert [s.id for s in ordered] == ["a", "b"]


def test_orphan_node_skipped():
    """Only a is wired from trigger; b is orphan and not executed."""
    rule = Rule()
    rule.steps = [_step("a", 0), _step("b", 1)]
    rule.flow_layout = {
        "edges": [
            {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
        ],
    }
    ordered, err = ordered_steps_from_flow(rule)
    assert err is None
    assert [s.id for s in ordered] == ["a"]


def test_diamond_merge():
    """trigger -> A -> B, A -> C, B -> D, C -> D: D after B and C."""
    rule = Rule()
    rule.steps = [
        _step("A", 0),
        _step("B", 1),
        _step("C", 2),
        _step("D", 3),
    ]
    rule.flow_layout = {
        "edges": [
            {"source": RULE_TRIGGER_NODE_ID, "target": "A"},
            {"source": "A", "target": "B"},
            {"source": "A", "target": "C"},
            {"source": "B", "target": "D"},
            {"source": "C", "target": "D"},
        ],
    }
    ordered, err = ordered_steps_from_flow(rule)
    assert err is None
    ids = [s.id for s in ordered]
    assert set(ids) == {"A", "B", "C", "D"}
    assert ids.index("D") > ids.index("B")
    assert ids.index("D") > ids.index("C")
    assert ids.index("A") < ids.index("B")
    assert ids.index("A") < ids.index("C")


def test_cycle_detected():
    rule = Rule()
    rule.steps = [_step("a", 0), _step("b", 1)]
    rule.flow_layout = {
        "edges": [
            {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
            {"source": "a", "target": "b"},
            {"source": "b", "target": "a"},
        ],
    }
    ordered, err = ordered_steps_from_flow(rule)
    assert ordered == []
    assert err is not None
    assert "cycle" in err.lower()


def test_ancestor_parallel_branches_empty():
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
        {"source": RULE_TRIGGER_NODE_ID, "target": "b"},
    ]
    order = ["a", "b"]
    assert ancestor_step_ids_sorted("a", edges, order) == []
    assert ancestor_step_ids_sorted("b", edges, order) == []


def test_ancestor_chain():
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
        {"source": "a", "target": "b"},
        {"source": "b", "target": "c"},
    ]
    order = ["a", "b", "c"]
    assert ancestor_step_ids_sorted("a", edges, order) == []
    assert ancestor_step_ids_sorted("b", edges, order) == ["a"]
    assert ancestor_step_ids_sorted("c", edges, order) == ["a", "b"]


def test_ancestor_join_two_paths():
    """trigger -> E, trigger -> S, E -> M, S -> M: M has both E and S as ancestors."""
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "E"},
        {"source": RULE_TRIGGER_NODE_ID, "target": "S"},
        {"source": "E", "target": "M"},
        {"source": "S", "target": "M"},
    ]
    order = ["E", "S", "M"]
    assert ancestor_step_ids_sorted("M", edges, order) == ["E", "S"]


def test_ancestor_no_edges_falls_back_to_linear_prefix():
    order = ["a", "b", "c"]
    assert ancestor_step_ids_sorted("a", None, order) == []
    assert ancestor_step_ids_sorted("b", None, order) == ["a"]
    assert ancestor_step_ids_sorted("c", [], order) == ["a", "b"]
