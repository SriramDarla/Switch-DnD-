# Switch DnD Campaign

A personal developer workflow gamified as a Dungeons & Dragons campaign, built on [Switch](https://docs.switchagents.ai/).

## What it is

Each type of developer work is a **level** (realm):
- Leetcode
- Course videos
- Side projects

Each task inside a level is a **quest**. Completing quests earns **XP**, and crossing thresholds **levels up** your character.

## What's in this repo

**`dnd-campaign.template.yaml`** — a Switch template that creates:

| Agent | Role |
|-------|------|
| `{name}-dungeon-master` | Narrates the campaign, verifies quest completions, awards XP, handles level-ups |
| `{name}-quest-giver` | Proposes and assigns quests inside levels |
| `{name}-scribe` | Maintains the World Bible (shared memory): character sheet, XP, quest log |

**Room:** `{name}-world-bible` — shared memory holding the World Bible (character sheet, XP, quest log, levels). Every agent reads the same state.

## How to use

1. Install [Switch Console](https://docs.switchagents.ai/switch-rooms/getting-started/install-switch-console.md)
2. Set up an agent provider (Claude Code, Codex, or OpenCode)
3. In Switch Console, go to **Templates → Import template**
4. Select `dnd-campaign.template.yaml`
5. Fill in the form:
   - **name** — prefix for agent/room names
   - **provider** — your AI coding agent
   - **bridge** — your chat app (Discord, Slack, Teams, Telegram, Mattermost)
6. Select **Use template**

The kickoff initializes the World Bible (level 1, 0 XP) and welcomes you to the campaign. Ask `@{name}-quest-giver` for your first adventure.

## Hackathon

Built for the [Flip the Switch Hackathon](https://www.wemakedevs.org/hackathons/switch) (Nov 4–7, 2026), Track 02: Best Personal or Creative Workflow.
