---
name: horrifying-notifs
description: Use when the user says they are AFK, away, or asleep and wants an audible alert for questions, approvals, or blockers. Also use when the user explicitly asks for a horrifying-notifs alarm.
---

# Get the human's attention

Requires the CLI on an awake local computer with audio access. Linux requires
`paplay` and `pactl`.

When the user enables AFK alerts, keep that instruction active until they say
they are back or ask to stop. An answer to one question does not turn alerts off.

Whenever you need an answer, decision, credential, manual action, or approval:

1. Run `horrifying-notifs` once and wait for it to finish.
2. Ask the user what you need, including enough context to answer.
3. Continue any independent work while the answer is pending.

Run the command **before** invoking an input or approval tool that may suspend
your turn. You cannot sound the alarm after execution has already paused. If
an action is known to require approval, alarm before initiating that action.

The command plays a three-second alarm at 100% system volume through the selected
output, then restores volume and mute. It needs no arguments. `--help` and
`--version` are silent.

An “already active” result means another invocation is sounding the alarm;
proceed with your question. Sound once per unanswered request. Repeat only if
the user requests it. A new question that needs an answer gets its own alarm.

If the command fails or requires permission, include that fact with your
question. Do not enter a retry loop or change the agent's permission settings.

Example user instruction:

> I'm going AFK. Run horrifying-notifs before asking me for any answer or
> approval. Keep working on anything independent while you wait.
