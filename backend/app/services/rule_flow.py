"""
Derive execution order from optional React Flow layout on Rule.

Trigger node id must match RULE_TRIGGER_NODE_ID. The graph is a DAG: steps reachable
from the trigger run in topological (Kahn) order. Fan-out is allowed; orphan steps
not reachable from the trigger are skipped. Cycles fail execution.
"""

from __future__ import annotations

import heapq
from collections import defaultdict, deque
from typing import Any, Optional

from app.database.models.rule import Rule, RuleStep

RULE_TRIGGER_NODE_ID = "__rule_trigger__"


def _build_outgoing(edges_raw: list) -> dict[str, list[str]]:
    outgoing: dict[str, list[str]] = defaultdict(list)
    for e in edges_raw:
        if not isinstance(e, dict):
            continue
        src = e.get("source")
        tgt = e.get("target")
        if isinstance(src, str) and isinstance(tgt, str):
            outgoing[src].append(tgt)
    for k in list(outgoing.keys()):
        outgoing[k] = list(dict.fromkeys(outgoing[k]))
    return outgoing


def _reachable_step_ids(
    outgoing: dict[str, list[str]],
    by_id: dict[str, RuleStep],
) -> set[str]:
    """BFS from trigger through step nodes only (follow edges between known steps)."""
    reachable: set[str] = set()
    q: deque[str] = deque([RULE_TRIGGER_NODE_ID])
    seen_nodes = {RULE_TRIGGER_NODE_ID}
    while q:
        u = q.popleft()
        for v in outgoing.get(u, []):
            if v == RULE_TRIGGER_NODE_ID:
                continue
            if v in by_id:
                reachable.add(v)
                if v not in seen_nodes:
                    seen_nodes.add(v)
                    q.append(v)
    return reachable


def _kahn_order(
    outgoing: dict[str, list[str]],
    reachable_steps: set[str],
) -> tuple[list[str], Optional[str]]:
    """Topological order of reachable step ids; error if cycle among {trigger} ∪ reachable."""
    if not reachable_steps:
        return [], None

    nodes: set[str] = {RULE_TRIGGER_NODE_ID} | reachable_steps
    in_degree: dict[str, int] = {n: 0 for n in nodes}

    for u in nodes:
        for v in outgoing.get(u, []):
            if v == RULE_TRIGGER_NODE_ID:
                continue
            if v in nodes:
                in_degree[v] += 1

    heap: list[str] = [n for n in nodes if in_degree[n] == 0]
    heapq.heapify(heap)

    order_ids: list[str] = []
    popped = 0
    while heap:
        u = heapq.heappop(heap)
        popped += 1
        if u in reachable_steps:
            order_ids.append(u)
        for v in outgoing.get(u, []):
            if v == RULE_TRIGGER_NODE_ID or v not in nodes:
                continue
            in_degree[v] -= 1
            if in_degree[v] == 0:
                heapq.heappush(heap, v)

    if popped != len(nodes):
        return [], "Rule flow: cycle detected (steps cannot be ordered)."

    if len(order_ids) != len(reachable_steps):
        return [], "Rule flow: cycle detected (steps cannot be ordered)."

    return order_ids, None


def ordered_steps_from_flow(
    rule: Rule,
) -> tuple[list[RuleStep], Optional[str]]:
    """
    Return steps in execution order (topological, trigger-first reachability).

    If flow_layout is missing or has no edges, fall back to order_index sort (error=None).

    Only steps reachable from the trigger via edges are included; orphan steps are skipped.

    If the reachable subgraph has a cycle, return ([], error_message).
    """
    steps = list(rule.steps or [])
    if not steps:
        return [], None

    by_id = {s.id: s for s in steps}
    raw = getattr(rule, "flow_layout", None)
    if raw is None or not isinstance(raw, dict):
        return sorted(steps, key=lambda s: s.order_index), None

    edges_raw = raw.get("edges")
    if not isinstance(edges_raw, list) or len(edges_raw) == 0:
        return sorted(steps, key=lambda s: s.order_index), None

    outgoing = _build_outgoing(edges_raw)
    reachable = _reachable_step_ids(outgoing, by_id)

    if not reachable:
        return [], None

    order_ids, err = _kahn_order(outgoing, reachable)
    if err:
        return [], err

    ordered = [by_id[i] for i in order_ids]
    return ordered, None


def flow_layout_error_message(raw: Any) -> Optional[str]:
    """If flow_layout JSON is structurally unusable, return a short reason (else None)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return "flow_layout must be a JSON object"
    edges = raw.get("edges")
    if edges is not None and not isinstance(edges, list):
        return "flow_layout.edges must be a list"
    return None
