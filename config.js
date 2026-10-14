// RPGlass settings. This is the only file you edit to turn on accounts.
// Leave supabaseUrl empty and the game runs without accounts, saving on each device only.
// These are the same values as RPGoal: both games share one Supabase project, each with its own save table.
// The anon key is safe to publish: the rules in supabase-setup.sql let each player read only their own save.
window.RPGLASS_CONFIG = {
  supabaseUrl: "https://ucbiisgpmfxdriwzirmh.supabase.co",
  supabaseAnonKey: "sb_publishable_kHpxPPAMKsWEyuFj5kS87Q_JvEocltc",
  googleClientId: "980448163382-votfvsi7mmki4ksg58rkr8geue0g9ag5.apps.googleusercontent.com",
  providers: { google: true }   // set google: false to show only the email code login
};
