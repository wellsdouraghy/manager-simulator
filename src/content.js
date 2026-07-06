// ============================================================================
// content.js — ALL copy, task data, and shared design tokens live here.
// Logic files import from this module; no jokes are hardcoded anywhere else.
// ============================================================================

/** Where the share text points. Replace before shipping. */
export const GAME_URL = 'https://example.com/manager-simulator';

/** The product. The July-AI end screen links here. */
export const JULY_URL = 'https://withjuly.com';

/** July's AI layer. Kept as a constant so it's trivial to rename. */
export const AUGUST_NAME = 'July AI';

// The call-to-action shown INSTEAD of the shareable report when the run was
// played with July AI on — sales-oriented, not a brag to screenshot.
export const JULY_CTA = {
  logo: '⚡ July',
  title: 'See how easy that felt?',
  body: 'July AI just called every shot for you. The real July is the back-office platform for talent agencies — deals, invoices, commissions, and contracts, all handled in one place.',
  statPrefix: 'You booked',
  statSuffix: 'with the assist.',
  cta: 'Get July for your agency →',
  again: 'Play again',
};

/**
 * The palette — the single source of truth for both 3D material colors and
 * the DOM CSS variables, so the room and the screen UIs read as one game.
 */
export const PALETTE = {
  ink: '#232b47', // walls, plastic, deep navy everything
  inkDeep: '#171d33', // floor, shadowed faces, panel backgrounds
  glow: '#fff4e0', // warm off-white — screens, text, the window sun
  urgent: '#ff5b5b', // coral/red — timers, damage, the mug
  mint: '#45c489', // success, money-adjacent good news
  gold: '#ffc94d', // commission, deal-close confetti
};

/** Push the palette into CSS variables so DOM UIs share it. */
export function applyPaletteToCSS() {
  const root = document.documentElement.style;
  root.setProperty('--ink', PALETTE.ink);
  root.setProperty('--ink-deep', PALETTE.inkDeep);
  root.setProperty('--glow', PALETTE.glow);
  root.setProperty('--urgent', PALETTE.urgent);
  root.setProperty('--mint', PALETTE.mint);
  root.setProperty('--gold', PALETTE.gold);
}

// ============================================================================
// Slice-1 placeholder copy (real content packs land in slices 2–6).
// ============================================================================

export const PLACEHOLDERS = {
  inbox: {
    title: 'JULY MAIL',
    sub: 'Inbox syncing… 47 unread. It was 3 when you sat down.',
  },
  phone: {
    title: '9:41',
    sub: 'Notifications are warming up. They always are.',
  },
  deals: {
    title: 'DEAL BOARD',
    sub: 'Nothing is on fire yet. Enjoy it.',
  },
  hint: 'Look with the cursor · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> or <kbd>A</kbd>/<kbd>D</kbd> to switch stations',
};

// ============================================================================
// Slice-2 run-machine overlays (title + end-of-day stub).
// ============================================================================

export const TITLE_SCREEN = {
  title: 'MANAGER SIMULATOR',
  subtitle: 'The inbox is not going to survive itself.',
  start: 'START DAY',
  tagline: 'One 3-minute workday. Zero chill.',
};

// The how-to-play card. Shown after START DAY; click anywhere to begin.
// Kept deliberately tiny — the warm-up is the real tutorial. The one thing a
// player MUST know is that the number keys switch screens.
export const INSTRUCTIONS = {
  title: 'HOW TO PLAY',
  rows: [
    { key: '1 2 3 4', text: 'Press these to switch between your four screens.' },
    { icon: '🖱️', text: 'Move the mouse to glance around the screen you’re on.' },
    { icon: '⏳', text: 'Reply before the timer runs out. Survive to 6 PM.' },
  ],
  go: 'Click anywhere to start →',
};

// Big red center-banner text shown when a task expires, per channel — so it's
// obvious WHAT you just dropped and that it cost you.
export const DAMAGE_LABELS = {
  email: 'MISSED EMAIL  🔥',
  dm: 'LEFT ON READ  🔥',
  negotiation: 'DEAL LOST  🔥',
  invoice: 'INVOICE WRITTEN OFF  🔥',
  door: 'THEY WANDERED OFF  🔥',
  default: 'TOO SLOW  🔥',
};

// Green center-banner text for the satisfying wins.
export const PRAISE_LABELS = {
  dealClosed: 'DEAL CLOSED! 🎉',
  lawyers: 'PAID IN FULL ⚖️',
  invoicePaid: 'INVOICE PAID 💰',
};

// Shown (with a "no" head-shake) when you try to switch screens while locked
// on a call or a boss walk — explains why you can't leave.
export const LOCK_MESSAGES = {
  call: "📞 You're on a call. You physically cannot leave. This is the job.",
  boss: '🚶 You are walking with your boss. Keep nodding.',
  default: "🔒 You can't leave right now.",
};

export const END_OF_DAY = {
  title: '6:00 PM — YOU SURVIVED',
  sub: "The inbox is still there. It will always be there. But not today.",
  again: 'RUN IT BACK',
  // Stat row labels for the stub report (real report card is slice 6).
  labels: {
    commission: 'Commission booked',
    emailsHandled: 'Emails handled',
    expired: 'Left to rot',
  },
};

// ============================================================================
// Email channel copy (slice 2). Ships verbatim — this voice is the product.
//
// Task/chip vocabulary:
//   spam:true        → newsletter fodder; a single Archive chip; combo fuel.
//   guaranteed:'chaos' → engine forces exactly one spawn during chaos phase.
//   route:'invoice'  → excluded from the slice-2 spawn pool (channel lands S4).
//   ttl (seconds)    → base ttl BEFORE phase scaling.
// Chip effects (all optional): { commission, burnout, quality,
//   special:'call'|'archive'|'coinflip'|'flagRival', coinflip:{win,lose},
//   flag:'rivalIgnored' } and instant:true (resolves without a station lock).
// ============================================================================

export const EMAILS = [
  {
    id: 'brightbrands',
    from: 'partnerships@brightbrands.co',
    sender: 'BrightBrands Partnerships',
    subject: 'Exciting Collab Opportunity!!',
    preview: '$250 + gifted product for a few little videos, super easy…',
    body:
      "Hi! We'd love to gift your creator our product ($250 value!) in exchange for 3 TikToks, 1 YouTube integration, 6-month category exclusivity, and perpetual usage rights. Super low-lift!",
    ttl: 20,
    chips: [
      {
        label: 'Our rates for that scope start at $15k — happy to send a menu.',
        effects: { commission: 1500, quality: 'good' },
      },
      {
        label: 'Sounds great, where do we sign!',
        effects: { commission: 150, quality: 'bad' },
      },
      { label: 'Archive', effects: { quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'quickcall',
    from: 'brand-lead@getonthephone.io',
    sender: 'A Brand Lead',
    subject: 'Quick call?',
    preview: 'Quick call?',
    body: 'Quick call?',
    ttl: 20,
    chips: [
      {
        label: 'Can you send details over email?',
        effects: { commission: 800, quality: 'good' },
        instant: true,
      },
      {
        label: 'Sure, calling now',
        effects: { commission: 2500, quality: 'good', special: 'call' },
      },
    ],
  },
  {
    id: 'anyupdate',
    from: 'accounts@brandthatghosted.com',
    sender: 'The Brand That Ghosted You',
    subject: 'Any update on this?',
    preview: 'Circling back! (They ghosted your contract three weeks ago.)',
    body:
      "Hey! Just circling back on this — any update? Excited to move forward! (This is the brand that went dark on your signed contract three weeks ago.)",
    ttl: 20,
    chips: [
      {
        label: 'Great timing! Re-attaching the contract.',
        effects: { commission: 1200, quality: 'good' },
      },
      {
        label: "Wow. He's alive.",
        effects: { commission: -300, quality: 'bad' },
        toast: 'Worth every dollar. Felt incredible.',
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'msa',
    from: 'legal@bigco-holdings.com',
    sender: 'BigCo Legal',
    subject: 'MSA for review — 47 pages, need by EOD',
    preview: 'Just a standard agreement, should be quick on your end.',
    body:
      "Attaching our Master Services Agreement for signature. It's 47 pages but pretty standard — we'll need it back by end of day. Thanks!",
    ttl: 20,
    chips: [
      {
        label: 'Our lawyer will turn it around Thursday.',
        effects: { commission: 600, quality: 'good' },
      },
      {
        label: 'Skimmed it, looks fine, signed',
        effects: { special: 'coinflip', coinflip: { win: 1000, lose: -2000 } },
      },
    ],
  },
  {
    id: 'earlybird',
    from: 'campaigns@samebudget.co',
    sender: 'Campaign Manager',
    subject: 'Same budget, but can we get everything a week early? 🙂',
    preview: 'Tiny ask! Same budget, just… sooner. Much sooner.',
    body:
      "Loving the plan! Same budget — but any chance we can get all deliverables a full week early? Would be a lifesaver 🙂",
    scopeCreep: true,
    ttl: 20,
    chips: [
      {
        label: 'Rush timelines are a rush rate. Here it is.',
        effects: { commission: 700, quality: 'good' },
      },
      {
        label: 'Sure, we can make it work.',
        effects: { commission: 300, burnout: 5, quality: 'bad' },
      },
    ],
  },
  {
    id: 'revision7',
    from: 'creative@neverhappy.studio',
    sender: 'Client Creative',
    subject: 'Revision #7: small tweak',
    preview: 'Just one small tweak (it is an entirely different concept).',
    body:
      "Almost there! Just one small tweak on the concept — can we make it about something completely different instead? Should be quick!",
    scopeCreep: true,
    ttl: 20,
    chips: [
      {
        label: "That's outside scope. Here's the change-order.",
        effects: { commission: 400, quality: 'good' },
      },
      {
        label: 'Okay, we can redo it.',
        effects: { commission: 900, burnout: 5, quality: 'bad' },
      },
    ],
  },
  {
    id: 'rivalintro',
    from: 'hello@rival-agency.co',
    sender: 'Rival Agency',
    subject: 'Intro — Rival Agency 👋',
    preview: 'Reaching out directly to your creator. Bold. Rude.',
    body:
      "Hi! We're Rival Agency and we'd love to chat with your creator about representation — we think we could do more for them. Are they around? 👋",
    ttl: 20,
    chips: [
      {
        label: 'Flagging this + calling my creator now',
        effects: { commission: 500, quality: 'good', special: 'flagRival' },
      },
      {
        label: 'Ignore',
        effects: { quality: 'neutral', flag: 'rivalIgnored' },
      },
    ],
  },
  {
    id: 'prfire',
    from: 'crisis@youneedtoseethis.now',
    sender: 'Your Publicist',
    subject: 'URGENT: [creator] posted something at 2am',
    preview: 'You need to see this before anyone else does. Too late.',
    body:
      "Call me. [creator] posted something at 2am and it is already screenshotted. We need a statement in the next five minutes. What do you want to say?",
    ttl: 10,
    guaranteed: 'chaos',
    chips: [
      {
        label: 'Issue a measured statement.',
        effects: { commission: 2000, quality: 'good' },
      },
      {
        label: '"No comment."',
        effects: { commission: 0, quality: 'neutral' },
      },
      {
        label: 'Any press is good press!',
        effects: { commission: -3000, burnout: 8, quality: 'bad' },
      },
    ],
  },
  {
    id: 'fourteen',
    from: 'brand@saythenamealot.com',
    sender: 'Overzealous Brand',
    subject: 'Can the creator say the brand name 14 times? Naturally.',
    preview: 'Fourteen. Naturally. In a 30-second video.',
    body:
      "Quick one — can the creator work our brand name in 14 times? Naturally, of course. We just really want it to land.",
    ttl: 20,
    chips: [
      {
        label: 'We suggest four. Four is already a lot.',
        effects: { commission: 500, quality: 'good' },
      },
      {
        label: 'Fourteen it is.',
        effects: { commission: 100, burnout: 3, quality: 'bad' },
      },
    ],
  },
  {
    id: 'carddeclined',
    from: 'billing@saastool.app',
    sender: 'SaaSTool Billing',
    subject: '⚠️ Your card was declined: SaaSTool renewal',
    preview: 'The tool you forgot you pay for would like money.',
    body:
      "We were unable to process your renewal for SaaSTool. Please update your payment method to avoid interruption to the tool you honestly forgot you were paying for.",
    ttl: 20,
    chips: [
      {
        label: 'Update card. Again.',
        effects: { commission: 0, quality: 'neutral' },
      },
    ],
  },
  // --- Newsletter spam (combo fuel). Single Archive chip each. ----------------
  {
    id: 'spam-zestly',
    from: 'news@zestly.io',
    sender: 'Zestly',
    subject: "We updated our privacy policy (nobody's favorite email)",
    preview: 'You have not opened Zestly since you signed up. We noticed.',
    body: "We've updated our Privacy Policy. There's nothing you can do about it and no action is required, yet here we are, in your inbox.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-loopwear',
    from: 'drops@loopwear.co',
    sender: 'LoopWear',
    subject: '🔥 The drop you didn\'t ask about is here',
    preview: 'Same six hoodies. New email. Zero context.',
    body: "Our new collection is live! It is the same as the last collection. We are emailing you about it anyway because a growth deck told us to.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-brewly',
    from: 'hello@brewly.club',
    sender: 'Brewly',
    subject: 'Your weekly digest of things you did not read',
    preview: '5 articles, 0 opened, 100% still sending.',
    body: "Here's your weekly digest! Featuring 5 articles you won't read and a webinar you'll register for and skip. See you next week, inevitably.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-flowdesk',
    from: 'team@flowdesk.app',
    sender: 'FlowDesk',
    subject: "We miss you! (Our churn dashboard misses you)",
    preview: "It's been 30 days. A dashboard somewhere turned yellow.",
    body: "Hey! We noticed you haven't logged in for a while. A retention automation has flagged you. This email is that automation. Come back? Please?",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  // --- Added gameplay emails (voice-matched to seeds). -----------------------
  {
    id: 'viralguaranteed',
    from: 'growth@buzzlyfy.co',
    sender: 'Buzzlyfy Growth',
    subject: 'We need this to go VIRAL (guaranteed)',
    preview: 'Budget is $300 but the deliverable is: virality, guaranteed.',
    body:
      "Hey! Budget's $300 but the ask is simple — we just need it to go viral. Guaranteed. Can you confirm the video will hit a million views? Thanks!",
    ttl: 20,
    chips: [
      {
        label: "Nobody can guarantee that. Here's what $300 actually buys.",
        effects: { commission: 500, quality: 'good' },
      },
      {
        label: 'Absolutely, consider it viral!',
        effects: { commission: 200, burnout: 3, quality: 'bad' },
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'exposure',
    from: 'founder@zestly.io',
    sender: 'Zestly Founder',
    subject: 'Collab — huge exposure for your creator!',
    preview: 'No budget, but the exposure would be *massive* for them.',
    body:
      "We don't have a budget for this one, but the exposure would be incredible for your creator — we have almost 4,000 followers. Think of the reach!",
    ttl: 20,
    chips: [
      {
        label: "Exposure doesn't pay rent. Our rate sheet's attached.",
        effects: { commission: 900, quality: 'good' },
      },
      {
        label: "You're right, the reach is worth it!",
        effects: { commission: 0, burnout: 4, quality: 'bad' },
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'cc14',
    from: 'campaigns@bigco-holdings.com',
    sender: 'BigCo Campaigns (+13 others)',
    subject: 'RE: RE: RE: Looping in a few more people',
    preview: "You've been CC'd with 13 strangers. Reply-all beckons.",
    body:
      "Hi all — looping in a few more stakeholders to align. Adding Legal, Brand, three Daves, and someone's assistant. Can everyone reply-all with availability? Thanks all!",
    ttl: 20,
    chips: [
      {
        label: "Reply to sender only, propose one time, move on.",
        effects: { commission: 600, quality: 'good' },
      },
      {
        label: 'Reply-all with your full calendar',
        effects: { commission: 100, burnout: 4, quality: 'bad' },
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'approvecaptions',
    from: 'brand@loopwear.co',
    sender: 'LoopWear Brand Team',
    subject: 'Just need to approve every caption first :)',
    preview: 'They want caption approval. And final cut. And the creator\'s soul.',
    body:
      "Loving the partnership! One tiny thing — we'll need to approve every caption, comment reply, and story before it goes live. Just to protect the brand. So easy!",
    ttl: 20,
    chips: [
      {
        label: 'One round of caption review, that\'s it. Here\'s the workflow.',
        effects: { commission: 700, quality: 'good' },
      },
      {
        label: 'Sure, send everything for approval!',
        effects: { commission: 200, burnout: 5, quality: 'bad' },
      },
    ],
  },
  {
    id: 'competitor2019',
    from: 'brand-safety@fitflow.app',
    sender: 'FitFlow Brand Safety',
    subject: 'Concern: your creator praised a competitor (2019)',
    preview: 'They found a 2019 comment. It said "cute!" Under a rival post.',
    body:
      "During our brand-safety audit we found your creator commented 'cute!!' on a competitor's post in 2019. We may need to pause the campaign pending review. Please advise.",
    ttl: 20,
    chips: [
      {
        label: 'That\'s a 2019 comment on a candle. We\'re good to proceed.',
        effects: { commission: 800, quality: 'good' },
      },
      {
        label: 'We\'ll have them delete it and apologize.',
        effects: { commission: 100, burnout: 3, quality: 'bad' },
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'ceoduet',
    from: 'exec-office@bytebank.co',
    sender: 'Office of the CEO',
    subject: 'Our CEO would love to do a duet',
    preview: 'The CEO has ideas. The CEO does not have TikTok. Yet.',
    body:
      "Our CEO saw your creator's video and would love to do a duet! He hasn't used the app before but he's very excited and has already written a script. When can we film?",
    ttl: 20,
    chips: [
      {
        label: 'Fun idea — let\'s scope it as a proper paid collab first.',
        effects: { commission: 1100, quality: 'good' },
      },
      {
        label: 'Amazing, we\'ll drop everything for the CEO!',
        effects: { commission: 300, burnout: 3, quality: 'bad' },
      },
    ],
  },
  {
    id: 'perpetuity',
    from: 'legal@momentum-labs.com',
    sender: 'Momentum Labs Legal',
    subject: 'Minor usage rights clarification',
    preview: 'Perpetuity. All media. Throughout the universe. Standard, they say.',
    body:
      "Small clarification on usage — we'll need the content in perpetuity, across all media now known or hereafter invented, throughout the universe. Totally standard boilerplate!",
    ttl: 20,
    chips: [
      {
        label: 'Universe is out of scope. 12-month, paid media, one market.',
        effects: { commission: 1400, quality: 'good' },
      },
      {
        label: 'The universe clause is fine, sign it',
        effects: { special: 'coinflip', coinflip: { win: 800, lose: -1800 } },
      },
    ],
  },
  {
    id: 'aipivot',
    from: 'strategy@sipco.co',
    sender: 'SipCo Strategy',
    subject: 'Exciting news: we\'re pivoting the whole campaign to AI',
    preview: 'Contract\'s signed, shoot\'s booked, and now it\'s all AI actually.',
    body:
      "Big update — leadership wants the whole campaign to be AI-generated now. Same budget, same deadline. Can the creator still be 'involved somehow'? Super excited about this direction!",
    ttl: 20,
    chips: [
      {
        label: 'The signed deal stands. New direction is a new deal.',
        effects: { commission: 1200, quality: 'good' },
      },
      {
        label: 'Sure, we\'ll figure out where the human fits',
        effects: { commission: 300, burnout: 4, quality: 'bad' },
      },
    ],
  },
  {
    id: 'nextquarter',
    from: 'partnerships@driftware.co',
    sender: 'Driftware Partnerships',
    subject: 'Budget is unlocked next quarter (start now though?)',
    preview: 'The money is next quarter. The deliverables are this week.',
    body:
      "We'd love to start immediately! The budget technically unlocks next quarter, but can the creator begin filming now, on good faith? We're basically already partners!",
    ttl: 20,
    chips: [
      {
        label: 'Happy to hold the slot. Work starts when the PO does.',
        effects: { commission: 900, quality: 'good' },
      },
      {
        label: 'Of course, we trust you — starting today!',
        effects: { commission: 0, burnout: 4, quality: 'bad' },
      },
      { label: 'Archive', effects: { commission: 0, quality: 'neutral', special: 'archive' } },
    ],
  },
  {
    id: 'littlerefresh',
    from: 'creative@glowmist.co',
    sender: 'GlowMist Creative',
    subject: 'Just needs a little refresh :)',
    preview: '"Little refresh" = new location, new script, new everything.',
    body:
      "The video's great! It just needs a little refresh — new location, new wardrobe, different talent energy, and a fresh concept. Tiny polish, same delivery date!",
    ttl: 20,
    chips: [
      {
        label: 'That\'s a full reshoot. Here\'s the reshoot quote.',
        effects: { commission: 1000, quality: 'good' },
      },
      {
        label: 'Okay, we\'ll refresh it by Friday.',
        effects: { commission: 400, burnout: 5, quality: 'bad' },
      },
    ],
  },
  // --- Added newsletter spam (combo fuel). Single Archive chip each. ----------
  {
    id: 'spam-crunchbar',
    from: 'snacks@crunchbar.co',
    sender: 'CrunchBar',
    subject: 'NEW flavor (it is the old flavor, renamed)',
    preview: 'Bold. Crunchy. Legally distinct from last month\'s flavor.',
    body: "Introducing our boldest flavor yet! It is the previous flavor with a new name and a slightly angrier font. Available everywhere you were already ignoring us.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-bytebank',
    from: 'security@bytebank.co',
    sender: 'ByteBank',
    subject: 'Important: nothing happened to your account',
    preview: 'A reassuring email about a breach they will not name.',
    body: "We're reaching out to confirm that everything is completely fine and there is absolutely no reason for this email. Your account is safe. Please do not read the news.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-fitflow',
    from: 'coach@fitflow.app',
    sender: 'FitFlow',
    subject: "You haven't worked out in 41 days (a robot noticed)",
    preview: 'A wellness app is disappointed in you, automatically.',
    body: "Hey champion! An automated wellness check-in has detected 41 days of inactivity. This message is that automation feeling let down on the app's behalf. You've got this (allegedly)!",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  {
    id: 'spam-sipco',
    from: 'community@sipco.co',
    sender: 'SipCo',
    subject: 'Our founder wrote a very long post on hydration',
    preview: '2,400 words. About water. You are subscribed to this now.',
    body: "Our founder has thoughts on hydration and has published all of them. This is part 1 of 6. You were auto-enrolled in the series when you loaded our homepage once.",
    ttl: 14,
    spam: true,
    chips: [{ label: 'Archive', effects: { special: 'archive', quality: 'neutral' } }],
  },
  // --- Invoice — excluded from slice-2 pool (negotiation channel lands S4). ----
  {
    id: 'invoice-1042',
    from: 'ap@slowpay-brands.com',
    sender: 'Slowpay Brands AP',
    subject: 'Invoice #1042 — now 63 days past due',
    preview: 'Net-30. It has been 63 days. Math is not their strength.',
    body:
      "This is an automated reminder that Invoice #1042 is now 63 days past due. Please note our standard terms are Net-30. We appreciate your business.",
    ttl: 20,
    route: 'invoice',
    chips: [
      { label: 'Send the polite-but-firm nudge.', effects: { commission: 0, quality: 'neutral' } },
    ],
  },
];

// Toast lines the channel shows for special resolutions (kept out of logic).
export const EMAIL_TOASTS = {
  coinflipWin: 'You skimmed it. It was fine. This time.',
  coinflipLose: 'Page 31, section 9(b). You should have read it.',
  archive: 'Archived. Gone. Never think about it again.',
  combo: (n) => `SPAM COMBO ×${n}`,
  call: 'On a call…',
  callDone: 'Call wrapped. That actually went well.',
  flagRival: 'Flagged. Creator called. Loyalty secured.',
  expired: 'Too slow. It expired.',
  emptyInbox: "Inbox zero. It won't last.",
};

// ============================================================================
// Slice-3 — the roster + creator DMs (the phone channel).
//
// The five creators you represent. `style` is a note-to-self for writing each
// DM in-voice; it is not rendered. Order here is the hearts-HUD order.
// ============================================================================

// Display name is "Creator" for all — players shouldn't have to track five
// names. The distinct texting voices (kept in the DM copy) still land as one
// creator in different moods. `emoji` gives each card a little visual variety.
export const CREATORS = [
  { id: 'maya', name: 'Creator', emoji: '🌙', style: 'all lowercase, no punctuation' },
  { id: 'dev', name: 'Creator', emoji: '🎙️', style: 'voice-memo energy, long paragraphs' },
  { id: 'juno', name: 'Creator', emoji: '🪩', style: 'emoji only when stressed' },
  { id: 'rio', name: 'Creator', emoji: '📈', style: 'extremely professional, scary when brief' },
  { id: 'tash', name: 'Creator', emoji: '🧃', style: 'sends "lol" with bad news' },
];

// ----------------------------------------------------------------------------
// DM templates. The phone channel owns spawning these via its pickTemplate().
//
// DM vocabulary (all optional unless noted):
//   creator:'<id>'      → REQUIRED. Which heart the happiness routes to.
//   text                → the message body, in that creator's voice.
//   timestamp           → overrides the live game clock on the card (e.g. the
//                         cursed 11:47 PM "we need to talk").
//   ttl (seconds)       → tight base ttl BEFORE phase scaling (10–14, react 7).
//   react:true          → a single ❤️ button; resolving in the top 40% pays
//                         effects.happiness + fastBonus.
//   fastBonus           → bonus happiness for a react tapped fast.
//   guaranteed:'chaos'  → engine forces exactly one spawn during that phase.
//   retention:true      → the rival-poaching test; injected when rivalIgnored.
//   onExpire.effects    → applied to the creator if the DM rots (default −12).
// Chip effects: { happiness, commission, burnout, quality,
//   special:'dmCall', lockSeconds, fastBonus }.
// ----------------------------------------------------------------------------

export const DMS = [
  // 1. we-need-to-talk — MAYA. Guaranteed once in chaos, cursed 11:47 PM stamp.
  {
    id: 'dm-wenedtotalk',
    creator: 'maya',
    timestamp: '11:47 PM',
    text: 'we need to talk',
    ttl: 11,
    guaranteed: 'chaos',
    onExpire: { effects: { happiness: -18 } },
    chips: [
      {
        label: 'calling you right now',
        effects: {
          special: 'dmCall',
          lockSeconds: 8,
          happiness: 25,
          quality: 'good',
        },
      },
      {
        label: 'can it wait till tomorrow?',
        effects: { happiness: -15, quality: 'bad' },
      },
    ],
  },
  // 2. JUNO — did the brand pay yet.
  {
    id: 'dm-brandpay',
    creator: 'juno',
    text: 'did the brand pay yet 👀',
    ttl: 12,
    chips: [
      {
        label: 'Checked — landing Thursday, I have it in writing.',
        effects: { happiness: 8, quality: 'good' },
      },
      {
        label: 'soon!!',
        effects: { happiness: -6, burnout: 2, quality: 'bad' },
      },
    ],
  },
  // 3. TASH — get me out of the shoot. Bad news, so: "lol".
  {
    id: 'dm-getmeout',
    creator: 'tash',
    text: "can you get me out of tomorrow's shoot lol",
    ttl: 12,
    chips: [
      {
        label: 'already on it. you owe me',
        effects: { happiness: 8, commission: -200, quality: 'good' },
      },
      {
        label: 'you have to go',
        effects: { happiness: -10, quality: 'bad' },
      },
    ],
  },
  // 4. DEV — said yes to a deal in his DMs. Long, rambling, voice-memo energy.
  {
    id: 'dm-saidyes',
    creator: 'dev',
    text:
      "ok so like. don't be mad. there was this brand in my dms and they seemed really cool and legit? and they were like we can move fast and i was like yeah i can move fast too and i think i. said yes? to a deal? i don't have the number in front of me but it felt like a lot in the moment. is that ok. is that fine. tell me it's fine",
    ttl: 14,
    onExpire: { effects: { happiness: -14 } },
    chips: [
      {
        label: "Forward me everything. Do NOT reply to them.",
        effects: { happiness: 10, commission: 300, quality: 'good' },
      },
      {
        label: 'you did WHAT',
        effects: { happiness: -8, quality: 'bad' },
        toast: 'He can hear the caps lock through the screen.',
      },
    ],
  },
  // 5. MAYA — engagement dipped, spiralling. In her voice.
  {
    id: 'dm-engagement',
    creator: 'maya',
    text: 'my engagement dipped 4 percent is my career over',
    ttl: 12,
    chips: [
      {
        label: "you're fine. one dip is not a trend. i've got you.",
        effects: { happiness: 10, quality: 'good' },
      },
      {
        label: 'sending you the chart — this is seasonal, every year.',
        effects: { happiness: 6, quality: 'good' },
      },
    ],
  },
  // 6. RIO — the rival's poaching pitch. Scary-brief. Also the retention test.
  {
    id: 'dm-retention',
    creator: 'rio',
    text: "The other agency said they'd get me 20% more. Thoughts?",
    ttl: 13,
    retention: true,
    onExpire: { effects: { happiness: -16 } },
    chips: [
      {
        label: "They quote 20% more because they take 30%. Here's your actual math.",
        effects: { happiness: 12, quality: 'good' },
      },
      {
        label: "lol they're lying",
        effects: { happiness: -12, quality: 'bad' },
      },
    ],
  },
  // 7. JUNO — posting in 5 min. Stressed, so: emoji-heavy. Cursed thumbnail.
  {
    id: 'dm-posting',
    creator: 'juno',
    text: 'posting this in 5 min unless you say no 😬😬 thumbnail is me captioned "worst manager ever????" as a JOKE 🙃🔥',
    ttl: 8,
    onExpire: { effects: { happiness: -10 } },
    chips: [
      {
        label: 'post it 🔥',
        effects: { happiness: 6, quality: 'bad' },
      },
      {
        label: 'DO NOT POST. calling you',
        effects: { happiness: 10, commission: 200, quality: 'good' },
      },
    ],
  },
  // 8. TASH — fire react. Pure free win.
  {
    id: 'dm-fire',
    creator: 'tash',
    text: '🔥🔥🔥',
    ttl: 7,
    react: true,
    fastBonus: 3,
    onExpire: { effects: { happiness: -6 } },
    chips: [
      {
        label: '❤️',
        effects: { happiness: 6, quality: 'good' },
      },
    ],
  },
  // 9. DEV — voice-memo about nothing. Warmup-friendly, tiny stakes.
  {
    id: 'dm-voicememo',
    creator: 'dev',
    text:
      "no like nothing's wrong i just. saw a dog on the way to the gym. it was wearing a little coat. i think about representation differently now. anyway. hope your day is good. that's the whole memo. bye",
    ttl: 13,
    onExpire: { effects: { happiness: -5 } },
    chips: [
      {
        label: 'the little coat. incredible. thank you for this.',
        effects: { happiness: 5, quality: 'good' },
      },
    ],
  },
  // 10. RIO — one-word status check. Warmup-friendly, scary-brief.
  {
    id: 'dm-status',
    creator: 'rio',
    text: 'Status?',
    ttl: 11,
    onExpire: { effects: { happiness: -6 } },
    chips: [
      {
        label: 'Two deals in review, one closing Friday. Numbers attached.',
        effects: { happiness: 6, quality: 'good' },
      },
      {
        label: 'all good!! 👍',
        effects: { happiness: -4, quality: 'bad' },
      },
    ],
  },
  // 11. MAYA — asking to bring her dog to the shoot. Lowercase, no punctuation.
  {
    id: 'dm-dogshoot',
    creator: 'maya',
    text: 'can i bring my dog to the sipco shoot he is very calm and also part of my brand now',
    ttl: 12,
    chips: [
      {
        label: "i'll ask the brand and clear it properly. odds are good.",
        effects: { happiness: 8, quality: 'good' },
      },
      {
        label: 'absolutely not, it is a beverage set',
        effects: { happiness: -8, quality: 'bad' },
      },
    ],
  },
  // 12. DEV — long voice-memo spiral about a rate he already quoted himself.
  {
    id: 'dm-quotedmyself',
    creator: 'dev',
    text:
      "hey so quick thing not a big thing. a brand asked my rate and i panicked and i think i said a number. i don't remember the number. it might have been low. it might have been really low. i said it with confidence though so maybe that counts for something? can you like. find out what i said and then make it not that. thank you i love you bye",
    ttl: 14,
    onExpire: { effects: { happiness: -12 } },
    chips: [
      {
        label: "Send me the thread. I'll re-anchor it before they reply.",
        effects: { happiness: 10, commission: 400, quality: 'good' },
      },
      {
        label: 'why do you keep doing this',
        effects: { happiness: -6, quality: 'bad' },
      },
    ],
  },
  // 13. JUNO — react DM, but stressed so the message is emoji. Free win.
  {
    id: 'dm-junoreact',
    creator: 'juno',
    text: '😭😭😭 the edit is DONE i cannot believe it is done 😭🎉',
    ttl: 7,
    react: true,
    fastBonus: 3,
    onExpire: { effects: { happiness: -6 } },
    chips: [
      {
        label: '❤️',
        effects: { happiness: 6, quality: 'good' },
      },
    ],
  },
  // 14. RIO — scary-brief. Two words. The manager's blood runs cold.
  {
    id: 'dm-newmanager',
    creator: 'rio',
    text: 'Quick question. Do you have a moment this week?',
    ttl: 12,
    onExpire: { effects: { happiness: -14 } },
    chips: [
      {
        label: 'Calling you in five. Whatever it is, we handle it together.',
        effects: { happiness: 12, quality: 'good' },
      },
      {
        label: 'kind of swamped, next week?',
        effects: { happiness: -12, quality: 'bad' },
      },
    ],
  },
  // 15. TASH — bad news delivered with "lol", as is tradition.
  {
    id: 'dm-missedpost',
    creator: 'tash',
    text: "so i posted the paid glowmist thing on the wrong account lol. the meme one. with the caption. lol",
    ttl: 12,
    onExpire: { effects: { happiness: -10 } },
    chips: [
      {
        label: 'breathe. we can reframe this. do NOT delete anything yet',
        effects: { happiness: 8, quality: 'good' },
      },
      {
        label: 'lol is not a plan tash',
        effects: { happiness: -8, quality: 'bad' },
      },
    ],
  },
  // 16. MAYA — 3am doubt spiral about a comment. Lowercase, no punctuation.
  {
    id: 'dm-onecomment',
    creator: 'maya',
    text: 'one person said my new direction is giving corporate should i delete everything and start over',
    ttl: 12,
    chips: [
      {
        label: "one comment is not a strategy. the numbers say keep going. i've got you.",
        effects: { happiness: 10, quality: 'good' },
      },
      {
        label: 'sending you the analytics — that direction is your best month yet.',
        effects: { happiness: 6, quality: 'good' },
      },
    ],
  },
];

// Toast lines for DM resolutions (kept out of logic).
export const DM_TOASTS = {
  expired: 'left on read 💀',
  fast: 'they saw the typing bubble immediately',
  call: (name) => `on the phone with ${name}…`,
  callDone: 'call wrapped. crisis averted.',
  react: 'reacted ❤️',
};

// The goodbye overlay + the 3-lost fail line. Ships verbatim.
export const CREATOR_LEAVES = {
  title: 'A creator has left your roster',
  message:
    "hey! so grateful for everything. I think it's time I explore other representation 💜",
  continue: 'CONTINUE',
  failReason: 'Your roster is now a group chat you\'re not in.',
  // Amber banner when a creator gets critically unhappy — reply NOW.
  warning: '⚠️ A CREATOR IS ABOUT TO WALK — CHECK YOUR PHONE',
};

// ============================================================================
// Slice-4 — the deal board (negotiation tug-of-war + invoice tone dial).
// Two engine channels, one CSS3D panel (800×450) split into two columns.
// ============================================================================

// Board shell copy + all deal/invoice toast lines. Ships verbatim.
export const DEAL_BOARD = {
  title: 'DEALS CRM',
  subtitle: 'Two columns. One of them is on fire. Probably both.',
  columns: {
    deals: 'DEALS',
    invoices: 'INVOICES',
  },
  // Shown by the handle while it's pinned past the green zone — teaches the
  // feathering mechanic in-fiction: over-pulling reads as greed.
  greedyHint: "easy — don't scare them off",
  // One-time mini tutorial the first time a negotiation opens (pauses the game).
  tutorial: {
    title: 'CLOSING A DEAL',
    body: 'Click and HOLD to pull the handle toward YOUR terms. The brand pulls back — get it into the green zone and hold there for 2 seconds to close.',
    go: 'Press and hold to begin →',
  },
  toasts: {
    // Negotiations
    closeTarget: 'Closed on YOUR terms. Contract sent before they blink.',
    closeAnchor: "You caved. They're thrilled. You are not.",
    evaporated: 'They went with a founder\'s nephew.',
    // Invoices
    invoicePaid: 'Paid. The money is real and it is in the account.',
    lawyersPaid: 'The word LAWYERS moves faster than any follow-up ever will.',
    tooSoft: 'They marked it read.',
    tooHot: "Brand has removed you from their holiday card list.",
    invoiceExpired: "They're never paying now. File it under 'lesson.'",
  },
};

// The five tone-dial stops, softest → nuclear. Ships verbatim.
export const TONE_STOPS = [
  'Just bumping this! 😊',
  'Following up 🙂',
  'Circling back.',
  'Per my last email.',
  'LAWYERS.',
];

// Minimum days-overdue for each tone stop index. The correct stop is the
// greatest index whose min ≤ days overdue.
export const TONE_MIN_DAYS = [0, 10, 30, 55, 90];

// Green zone for the tug-of-war handle, in handle-position [0,1] space.
// August doubles `width` in slice 6 (0.78..0.96 → 0.78..1.14, clamped).
export const NEGOTIATION_GREEN_ZONE = { start: 0.78, width: 0.18 };

// ----------------------------------------------------------------------------
// Negotiation seeds. The DEALS column spawns these via the channel's
// pickTemplate(). Each: { id, brand, creator, dealValue, commission,
// anchorLabel, targetLabel, ttl }. The anchor→target line is the whole joke.
// ----------------------------------------------------------------------------
export const NEGOTIATIONS = [
  {
    id: 'nego-sipco',
    brand: 'SipCo',
    creator: 'maya',
    dealValue: 8000,
    commission: 1600,
    anchorLabel: '$500 flat, perpetual usage',
    targetLabel: '$8,000, 90-day usage',
    ttl: 30,
  },
  {
    id: 'nego-glowmist',
    brand: 'GlowMist',
    creator: 'juno',
    dealValue: 12000,
    commission: 2400,
    anchorLabel: '3 Reels + 10 stories, gifted',
    targetLabel: '$12,000 package',
    ttl: 30,
  },
  {
    id: 'nego-bytebank',
    brand: 'ByteBank',
    creator: 'rio',
    dealValue: 15000,
    commission: 3000,
    anchorLabel: 'full exclusivity, 12 months',
    targetLabel: 'category exclusivity, 60 days',
    ttl: 30,
  },
  {
    id: 'nego-crunchbar',
    brand: 'CrunchBar',
    creator: 'dev',
    dealValue: 10000,
    commission: 2000,
    anchorLabel: 'we own the concept',
    targetLabel: 'creator retains IP',
    ttl: 30,
  },
  {
    id: 'nego-fitflow',
    brand: 'FitFlow',
    creator: 'tash',
    dealValue: 9000,
    commission: 1800,
    anchorLabel: "payment on 'results'",
    targetLabel: '50% upfront, net-30',
    ttl: 30,
  },
  {
    id: 'nego-zestly',
    brand: 'Zestly',
    creator: 'maya',
    dealValue: 7000,
    commission: 1400,
    anchorLabel: '5 videos, "just be authentic" (unpaid)',
    targetLabel: '$7,000, one video, one revision',
    ttl: 30,
  },
  {
    id: 'nego-loopwear',
    brand: 'LoopWear',
    creator: 'dev',
    dealValue: 16000,
    commission: 3200,
    anchorLabel: 'whole-life exclusivity, no rate card',
    targetLabel: '$16,000, apparel category, 90 days',
    ttl: 30,
  },
];

// ----------------------------------------------------------------------------
// Invoice seeds. The INVOICES column spawns these via pickTemplate(). Each:
// { id, brand, number, amount, days, commission, correctStop, ttl }. The
// correct stop is precomputed here for clarity but re-derived on requeue
// (days climb by +18 when a too-soft nudge re-queues the invoice).
// ----------------------------------------------------------------------------
// ============================================================================
// Slice-5 — the damage model: coffee, door walk-ins, burnout + Last Stand.
// ============================================================================

// Coffee: per-charge toasts (index 0 = first sip), the dry-mug line, HUD label.
export const COFFEE = {
  hudLabel: 'coffee',
  charges: [
    'coffee #1: purely medicinal.',
    'coffee #2: the good one.',
    'coffee #3: this is the last one. (it is not.)',
    'coffee #4: found a spare. do not question it.',
  ],
  dryMug: 'the mug is empty. you knew this.',
  refill: 'the intern refilled your mug. bless them.',
};

// Burnout: the Last Stand banner + recovery toast, and the pass-out report line.
export const BURNOUT = {
  lastStandBanner: 'LAST STAND — clear 3 tasks. now.',
  lastStandSuccess: 'You clawed it back. Breathe. Keep moving.',
  passoutReport: 'You passed out at your desk. The inbox won. Today.',
  // Toasts fired as burnout crosses thresholds (main.js may surface these).
  entering: "you're running on fumes.",
};

// ----------------------------------------------------------------------------
// Door walk-ins. Keyed by id; the channel spawns via its pool. `guaranteed`
// forces exactly one during that phase (boss in busy, maintenance in chaos).
//   kind:'boss'|'intern'|'maintenance'  → drives the card layout in door.js.
//   chips[].special:'bossLock'|'coffee' → special resolution paths.
//   chips[].doneToast                   → shown when a bossLock finishes paying.
// ----------------------------------------------------------------------------
export const DOOR_EVENTS = {
  boss: {
    id: 'door-boss',
    kind: 'boss',
    guaranteed: 'busy',
    ttl: 16,
    kicker: 'KNOCK KNOCK',
    title: 'Your boss',
    body:
      '"Hey — got a sec?" He does not want a sec. He wants forty minutes and a decision you\'ll be blamed for either way.',
    lockIndicator: 'nodding along…',
    chips: [
      {
        label: 'Of course.',
        special: 'bossLock',
        effects: { commission: 1200, burnout: 2, quality: 'good' },
        doneToast: 'That was 8 minutes you will never audit.',
      },
      {
        label: 'Walk with me — I literally cannot leave this desk.',
        effects: { commission: 200, quality: 'neutral' },
        toast: 'He respected it. Slightly.',
      },
    ],
  },
  intern: {
    id: 'door-intern',
    kind: 'intern',
    ttl: 16,
    kicker: 'a soft knock',
    title: 'The intern',
    body:
      'They brought you a coffee. Unprompted. They remembered your order. You could cry, but there is no time to cry.',
    chips: [
      {
        label: 'bless you, specifically',
        effects: { burnout: -20 },
        toast: 'That coffee took ten points off your blood pressure. The intern is going places.',
      },
    ],
  },
  maintenance: {
    id: 'door-maintenance',
    kind: 'maintenance',
    guaranteed: 'chaos',
    ttl: 16,
    kicker: 'BRRRRRT',
    title: 'Building maintenance',
    body:
      '"We\'re testing the fire alarm. This is only a test. You do not need to do anything. Please do not do anything."',
    indicator: 'testing… testing…',
    doneToast: 'The test concluded. Nothing was learned.',
  },
  // Fallback wander-off line if a door task rots (no per-event onExpire).
  _expired: 'They gave up and wandered off. Not everything needs you.',
};

export const INVOICES = [
  {
    id: 'inv-1042',
    brand: 'Slowpay Brands',
    number: '#1042',
    amount: 3400,
    days: 12,
    commission: 510,
    correctStop: 1, // "Following up 🙂"
    ttl: 26,
  },
  {
    id: 'inv-1088',
    brand: 'Driftware Co.',
    number: '#1088',
    amount: 5200,
    days: 34,
    commission: 780,
    correctStop: 2, // "Circling back."
    ttl: 26,
  },
  {
    id: 'inv-1120',
    brand: 'Kettle & Bloom',
    number: '#1120',
    amount: 8000,
    days: 63,
    commission: 1200,
    correctStop: 3, // "Per my last email."
    ttl: 26,
  },
  {
    id: 'inv-0931',
    brand: 'Momentum Labs',
    number: '#0931',
    amount: 11500,
    days: 97,
    commission: 1725,
    correctStop: 4, // "LAWYERS."
    ttl: 26,
  },
  {
    id: 'inv-1156',
    brand: 'GlowMist',
    number: '#1156-final-FINAL',
    amount: 4600,
    days: 4,
    commission: 690,
    correctStop: 0, // "Just bumping this! 😊" — barely overdue, keep it warm
    ttl: 26,
  },
];

// ============================================================================
// Slice 6a — the report card, titles, share text, August Mode, and sound copy.
// These sections are appended-only; report.js drives the predicates via the
// `when` condition keys below (no functions live in content).
// ============================================================================

/**
 * The end-of-day performance review. Serif corporate-review styling lives in
 * report.js / styles.css; all the words are here.
 */
export const REPORT_CARD = {
  docTitle: 'Q3 PERFORMANCE REVIEW — JULY',
  reviewedBy: 'REVIEWED BY: yourself, at your desk',
  survivedHeading: 'DAY SURVIVED',
  incompleteHeading: 'DAY INCOMPLETE',
  incompleteStamp: 'INCOMPLETE',
  // Fail sub-lines, keyed by failReason.
  fail: {
    passout: 'Filed early: you passed out at your desk.',
    exodus: 'Filed early: the roster walked.',
    generic: 'Filed early: the day got away from you.',
  },
  gradeLabel: 'FINAL GRADE',
  labels: {
    commission: 'Commission booked',
    deals: 'Deals closed',
    invoices: 'Invoices collected',
    retained: 'Talent retained',
    response: 'Avg response time',
    tasksMissed: 'Tasks missed',
  },
  units: {
    response: 's',
  },
  personalBest: 'New personal best!',
  copy: 'COPY RESULT',
  copied: 'copied ✓',
  again: 'RUN IT BACK',
  // August footnote block (only shown when august was used during the run).
  augustFootnote: (name) => `*achieved with ${name}`,
  augustDeadpan: 'Or you could just play on easy mode in real life.',
};

/**
 * Titles = the manager's PERSONA for the run. Evaluated top-to-bottom, first
 * match wins. `when` is a condition KEY resolved by a predicate table in
 * report.js (spec: no functions here). Each carries an emoji, a letter grade
 * (S/A/B/C/D — the shareable rank), and a one-line verdict blurb.
 */
export const TITLES = [
  {
    title: 'INBOX ZERO DEITY',
    when: 'deity',
    emoji: '🧘',
    grade: 'S',
    blurb: "Inbox zero, full roster, big money. This isn't a job to you — it's a calling.",
  },
  {
    title: 'CERTIFIED CLOSER',
    when: 'closer',
    emoji: '🤝',
    grade: 'A',
    blurb: "You'd sell perpetual usage rights to the actual sun.",
  },
  {
    title: 'SPEED OF SEND',
    when: 'speed',
    emoji: '⚡',
    grade: 'A',
    blurb: 'Sub-four-second replies, all day. Your thumbs have seen things.',
  },
  {
    title: 'THE QUICK CALL MARTYR',
    when: 'martyr',
    emoji: '📞',
    grade: 'B',
    blurb: 'You took every "quick call." None were quick. You knew. You answered anyway.',
  },
  {
    title: 'GHOSTED BUT GRINDING',
    when: 'grinding',
    emoji: '🔥',
    grade: 'B',
    blurb: '80% burnt out and still swinging. Please rest. We know you won’t.',
  },
  {
    title: 'EXPLORING OTHER REPRESENTATION',
    when: 'lostTalent',
    emoji: '💔',
    grade: 'C',
    blurb: 'A creator left to "explore other representation." The pastures are not greener.',
  },
  {
    title: 'TOUCH GRASS (PLEASE)',
    when: 'passout',
    emoji: '🫠',
    grade: 'D',
    blurb: 'You passed out at your desk. The inbox won. Today. Only today.',
  },
  {
    title: 'PER MY LAST EMAIL',
    when: 'default',
    emoji: '📩',
    grade: 'C',
    blurb: 'A solid, unremarkable day. Nobody posted about it on LinkedIn.',
  },
];

/**
 * Share text template. Placeholders in {curly}. Line 1 swaps on survival.
 * report.js fills these and copies the assembled block to the clipboard.
 */
export const SHARE = {
  survivedLine: 'Manager Simulator — Day Survived ☑️',
  failedLine: 'Manager Simulator — Day NOT Survived ❌',
  // The body lines, in order. {tokens} filled by report.js.
  lines: [
    '{emoji} {title} — Grade {grade}',
    '💰 ${commission} · 🤝 {dealsClosed}/{dealsAttempted} deals · 💜 {retained}/{roster} · ❌ {missed} missed',
    '“{blurb}”',
    'Can you survive the inbox? {url}',
  ],
};

/** July-AI (assist) mode copy. Rename via AUGUST_NAME at the top of this file. */
export const AUGUST = {
  toggleLabel: (name) => `⚡ ${name} Mode`,
  tryAgainLabel: (name) => `▶ TRY AGAIN WITH ${name.toUpperCase()}`,
  description: 'It highlights the right move on every screen. You just click.',
  handledStamp: 'handled ✓',
  suggests: 'July AI',
};

/** Sound toggle copy (the corner 🔊 button). */
export const SOUND = {
  onLabel: '🔊',
  offLabel: '🔇',
  title: 'sound',
};
