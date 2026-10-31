# Talk track: Privilege Map LAB

Each `##` heading is one presenter step. Presenter mode shows them in order. Names in the text come from content/cast.json, and customer.config can rename them.

## This is simulated

Start with the banner. Everything on this page is documentation and simulation. There is no tenant behind it, no credential, and nothing leaves this machine. The Live button is off because this app has nothing to go live against. If a customer asks "is that your tenant", the answer is no.

## Start with the identity map

Open the Map page and the first diagram. {{cast.key}} is the agent's whole identity. Press Simulate and walk the arrows: who the key acts as, what it can reach, and what is attached to it. Drag a box to show the diagram is live, then press Reset to put it back.

## Walk the order of checks

Switch to the second diagram. {{cast.gateway}} runs five checks in a fixed order on every call. Say the order out loud: key, scope, grant, limits, guardrail. Each failure arrow has its own status code, so the code tells you which check said no.

## Show who is accountable

Open the Identity page. Pick Agent Registry. The point is the custodian: the human {{cast.agent}} acts as, who policy is issued to, and who the gateway log names. Say that a key with no accountable human is the problem this solves.

## Show the model and tool paths

Open the LLM page, then MCP and A2A. One route per provider, and one set of key checks. For tools, the grant decides which tools are visible at all. Keep it short; the detail is on each feature card.

## Be honest about what is unverified

Open "Sources and what is not verified" on any feature before you present it. The content is a draft compiled from documentation and owner tests, and each card lists what was not measured. If it is not on the card as verified, do not claim it.

## Tell a story

Open the Stories page. Pick the story that fits the room: a new agent identity, a call walking the checks, or a refusal that needs diagnosing. The names in the stories come from customer.config, so rename the cast if the audience wants its own vocabulary.

## Reset

Press Reset in the footer between sessions. It clears this workspace's trace and presenter position. Settings stay. Another workspace is untouched.
