# Cloudy's Attack Intel

A lightweight Torn userscript for attack pages. It puts target activity and status information at the top of the attack screen so mercenary, territory-war, ranked-war, and contract hitters can quickly judge whether a target meets activity requirements.

## v1.0.0

- Exact rolling **last action** age
- HOT / RECENT / STALE / COLD activity indicator
- Configurable **active within X minutes** pass/fail badge
- Torn online / idle / offline state
- Current Torn status (Okay, Hospital, Traveling, etc.)
- Remaining status time when available
- Player level
- Faction
- Manual refresh
- Configurable automatic refresh (10–300 seconds)
- Torn SPA / target-change detection
- Desktop Tampermonkey support
- Torn PDA compatibility hooks
- API key stored locally in the userscript/browser storage

## API access

The script uses Torn API v2:

- `/user/{id}/basic`
- `/user/{id}/faction`

These endpoints require only public API access. A Limited key also works.

The key is sent only to `api.torn.com`.

## Install / distribution

GitHub is the source of truth:

`cloudys-attack-intel.user.js`

Raw source:

https://raw.githubusercontent.com/gregapackard/torn-attack-intel/main/cloudys-attack-intel.user.js

Greasy Fork should be configured to sync/import this GitHub file. Greasy Fork then acts as the normal install/update channel for users.

## PDA

The script supports the same PDA key placeholder convention used by Cloudy's Chain Manager:

`###PDA-APIKEY###`

If Torn PDA injects that value, no separate key entry is needed. Otherwise open the gear on the Attack Intel bar and enter a Torn API key.

## Notes

Attack Intel is informational only. It does not attack targets, click attack controls, select targets, or automate combat.

## License

MIT
