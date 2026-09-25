# Engaged visitor counter

This Worker counts a browser session only after the portfolio client has been visible for ten seconds and the visitor has interacted with it. A first-party session ID prevents repeated refreshes from incrementing the counter for thirty days.

Deploy from this directory with `npx wrangler deploy`. Add the custom domain route `rudrakshbhandari.com/api/engaged-visitor` to the Worker after deployment. The site client calls that same path.
