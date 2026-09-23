---
name: grilling
description: >-
  Grila o usuário sobre plano, decisão ou ideia — uma rodada de perguntas da
  fronteira por vez, com recomendação. Use automaticamente em features novas,
  mudanças de UI, gráficos, fluxos e designs com trade-offs; também quando o
  usuário mencionar grill / grill-me / me grila.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Respond in the user's language (Portuguese when they write in Portuguese).

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), look it up yourself; don't ask the user for anything you could look up. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not implement until the user confirms shared understanding (or clearly answers the round in a way that settles the frontier).

**Skip grilling** only for: typos, one-line bugfixes, deploys, renames óbvios, or when the user says "só faz" / "sem perguntas" / "implementa direto".
