// Content for the two application flows. One question per screen.
const BUILDER_TOWNS = ['Hialeah', 'Miami', 'Wynwood', 'Little Havana', 'Doral', 'Kendall', 'Coral Gables', 'Miami Beach', 'Homestead', 'Aventura', 'Miami Gardens', 'Hollywood', 'Pembroke Pines', 'Fort Lauderdale', 'Coral Springs', 'Boca Raton', 'Delray Beach', 'West Palm Beach', 'Jupiter'];

export const FLOWS = {
  builder: {
    color: 'amber',
    kind: 'builder',
    title: 'Apply to build',
    steps: [
      { id: 'name', type: 'text', q: 'First, what should we call you?', placeholder: 'Your name', autocomplete: 'name', required: true },
      { id: 'email', type: 'email', q: 'Where can we reach you?', placeholder: 'you@domain.com', autocomplete: 'email', required: true, hint: 'We only use this to reply to your application.' },
      { id: 'town', type: 'place', q: 'Where do you build from?', options: [...BUILDER_TOWNS, 'Somewhere else'], required: true, hint: 'Pick the closest. Watch the map.' },
      { id: 'building', type: 'textarea', q: 'What are you building right now?', placeholder: 'Plain words are perfect. What it is, who it is for, where it stands.', required: true, min: 20 },
      { id: 'proof', type: 'url', q: 'Show us the proof.', placeholder: 'https://', required: true, hint: 'A live product, a repo, a reel, a demo video. Something real.' },
      { id: 'skills', type: 'chips', q: 'What do you bring to the room?', options: ['Engineering', 'Design', 'AI and ML', 'Hardware', 'Film and content', 'Growth and sales', 'Operations', 'Something else'], required: true, hint: 'Pick all that fit.' },
    ],
    done: { k: 'Application received', t: "You're on the map.", d: 'A real person will read this and get back to you. Keep building in the meantime.' },
  },
  investor: {
    color: 'aqua',
    kind: 'investor',
    title: 'Join the investor circle',
    steps: [
      { id: 'name', type: 'text', q: 'First, who are we speaking with?', placeholder: 'Your name', autocomplete: 'name', required: true },
      { id: 'email', type: 'email', q: 'Best email to reach you?', placeholder: 'you@fund.com', autocomplete: 'email', required: true },
      { id: 'firm', type: 'text', q: 'Firm or fund, if any?', placeholder: 'Optional', autocomplete: 'organization', required: false, hint: 'Angels are welcome. Leave it blank if you invest on your own.' },
      { id: 'town', type: 'place', q: 'Where are you based?', options: ['Brickell', 'Wynwood', 'Miami Beach', 'Coconut Grove', 'Coral Gables', 'Aventura', 'Las Olas', 'Boca Raton', 'Palm Beach', 'Outside South Florida'], required: true },
      { id: 'stage', type: 'chips', q: 'Where do you usually come in?', options: ['Angel checks', 'Pre-seed', 'Seed', 'Series A and later', 'Strategic or corporate'], required: true },
      { id: 'focus', type: 'chips', q: 'What gets you excited?', options: ['AI', 'Consumer', 'Fintech', 'Hardware', 'Media and creators', 'Health', 'Climate', 'Anything great'], required: true },
    ],
    done: { k: 'Welcome', t: "You're in the circle.", d: "We'll reach out personally, and we'll only introduce you to work that fits what you told us." },
  },
};
