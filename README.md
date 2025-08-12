Create → Setup → Option → Save → Detail

Create (/portfolio/new): waits for Clerk, calls createPortfolio, then router.push(/portfolio/setup?pid=<id>).

Setup (/portfolio/setup): shows 3 options; each link keeps pid.

Option 1 (/portfolio/ai-full): POST /api/propose → shows holdings & rationale → Save writes to store and navigates to /dashboard/<id>.

Option 2 (/portfolio/path):

POST /api/path/propose → current snapshot + scenarios.

User picks a scenario → POST /api/path/build → holdings + rationale → Save to /dashboard/<id>.

Option page attempts movePortfolio("", userId, pid) (and "local-user", "guest") before giving up.

Detail (/dashboard/[id]): holdings table, summary, quick stats, Back, Refine with AI, Export CSV, Delete.

Dashboard (/dashboard): cards link to detail if proposal exists, otherwise back to setup.


src/
  app/
    dashboard/
      page.tsx           # Dashboard list (cards)
      [id]/page.tsx      # Portfolio detail page (holdings + rationale)
      layout.tsx         # (optional) shared background/layout for /dashboard/*
    portfolio/
      new/page.tsx       # Questionnaire + Create portfolio (waits for Clerk)
      setup/page.tsx     # "Choose an option" hub (carries ?pid=)
      ai-full/page.tsx   # Option 1 — AI builds the full portfolio
      path/page.tsx      # Option 2 — Macro paths → pick one → AI builds
      costum/page.tsx    # Option 3 — Custom scenario (placeholder)
    chat/page.tsx        # Chat to refine a saved portfolio (uses ?pid=)
    api/
      propose/route.ts         # POST /api/propose           (Option 1)
      path/propose/route.ts    # POST /api/path/propose      (Option 2 - step 1)
      path/build/route.ts      # POST /api/path/build        (Option 2 - step 2)
      path/refine/route.ts     # POST /api/path/refine       (Refine holdings)
  lib/
    portfolioStore.ts     # localStorage per-user store and helpers
  components/
    RotatingHeadline.tsx  # example component