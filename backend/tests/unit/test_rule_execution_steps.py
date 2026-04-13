"""
Regression tests for per-step Jinja `steps` context (ancestor-only, execution order).

Mirrors the loop in rule_engine.execute_rule without DB or I/O.
"""

from __future__ import annotations

from app.database.models.rule import Rule, RuleStep
from app.services.rule_engine import _render_json_leaves, _render_template_str
from app.services.rule_flow import RULE_TRIGGER_NODE_ID, ancestor_step_ids_sorted, ordered_steps_from_flow


def _step(sid: str, oi: int, name: str = "S", step_type: str = "llm_prompt") -> RuleStep:
    return RuleStep(
        id=sid,
        rule_id="rule-1",
        order_index=oi,
        name=name,
        step_type=step_type,
        config={},
    )


def _simulate_execute_steps_context(
    edges_raw: list | None,
    order_ids: list[str],
) -> list[list[dict]]:
    """
    Same shape as execute_rule: before each step, context['steps'] is built from ancestor results only.
    """
    results_by_id: dict[str, str] = {}
    contexts: list[list[dict]] = []
    for sid in order_ids:
        anc = ancestor_step_ids_sorted(sid, edges_raw, order_ids)
        ctx_steps = [{"result": results_by_id[aid]} for aid in anc]
        contexts.append(ctx_steps)
        results_by_id[sid] = f"out-{sid}"
    return contexts


def test_parallel_branches_each_step_sees_empty_steps():
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
        {"source": RULE_TRIGGER_NODE_ID, "target": "b"},
    ]
    order = ["a", "b"]
    ctxs = _simulate_execute_steps_context(edges, order)
    assert ctxs == [[], []]


def test_linear_chain_accumulates_only_ancestors():
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "a"},
        {"source": "a", "target": "b"},
        {"source": "b", "target": "c"},
    ]
    order = ["a", "b", "c"]
    ctxs = _simulate_execute_steps_context(edges, order)
    assert ctxs[0] == []
    assert ctxs[1] == [{"result": "out-a"}]
    assert ctxs[2] == [{"result": "out-a"}, {"result": "out-b"}]


def test_join_merge_sees_both_parallel_ancestors():
    edges = [
        {"source": RULE_TRIGGER_NODE_ID, "target": "E"},
        {"source": RULE_TRIGGER_NODE_ID, "target": "S"},
        {"source": "E", "target": "M"},
        {"source": "S", "target": "M"},
    ]
    order = ["E", "S", "M"]
    ctxs = _simulate_execute_steps_context(edges, order)
    assert ctxs[0] == []
    assert ctxs[1] == []
    assert ctxs[2] == [{"result": "out-E"}, {"result": "out-S"}]


def test_no_edges_linear_prefix_matches_legacy_semantics():
    """When flow has no edges, ancestor_step_ids_sorted uses strict prefix of execution_order_ids."""
    order = ["a", "b", "c"]
    ctxs = _simulate_execute_steps_context(None, order)
    assert ctxs[0] == []
    assert ctxs[1] == [{"result": "out-a"}]
    assert ctxs[2] == [{"result": "out-a"}, {"result": "out-b"}]


def test_diamond_merge_D_context_includes_all_three_ancestors():
    """trigger -> A -> B, A -> C, B -> D, C -> D: D depends on A, B, C."""
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
    order_ids = [s.id for s in ordered]
    assert set(order_ids) == {"A", "B", "C", "D"}

    anc_d = ancestor_step_ids_sorted("D", rule.flow_layout["edges"], order_ids)
    assert set(anc_d) == {"A", "B", "C"}
    assert anc_d == [x for x in order_ids if x in {"A", "B", "C"}]

    ctxs = _simulate_execute_steps_context(rule.flow_layout["edges"], order_ids)
    idx_d = order_ids.index("D")
    assert {r["result"] for r in ctxs[idx_d]} == {"out-A", "out-B", "out-C"}


def test_jinja_steps_and_meeting_in_template():
    ctx = {
        "meeting": {"title": "Hi", "transcript": "x"},
        "participants": [],
        "steps": [{"result": "first"}, {"result": {"k": 2}}],
    }
    assert _render_template_str("{{ steps[0].result }}", ctx) == "first"
    assert _render_template_str("{{ steps[1].result.k }}", ctx) == "2"
    assert _render_template_str("{{ meeting.title }}:{{ steps|length }}", ctx) == "Hi:2"


def test_jinja_empty_steps_branch():
    ctx = {
        "meeting": {"title": "T", "transcript": ""},
        "participants": [],
        "steps": [],
    }
    assert _render_template_str("{% if steps %}{{ steps[0].result }}{% else %}none{% endif %}", ctx) == "none"


def test_render_json_leaves_resolves_steps_in_nested_config():
    ctx = {
        "meeting": {"title": "Sync"},
        "participants": [],
        "steps": [{"result": "summary text"}],
    }
    obj = {
        "subject": "{{ meeting.title }}",
        "payload": {"note": "{{ steps[0].result }}"},
    }
    out = _render_json_leaves(obj, ctx)
    assert out == {"subject": "Sync", "payload": {"note": "summary text"}}


def test_ancestor_unknown_step_id_returns_empty():
    assert ancestor_step_ids_sorted("missing", [], ["a", "b"]) == []
