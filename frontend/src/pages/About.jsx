import { useEffect } from "react";

const FUNCTION_MEANINGS = [
  ["The focused home screen", "A starting point for intentional action. It keeps essential tools visible and leaves distracting applications one deliberate step away."],
  ["The large clock", "Time awareness without opening another app, checking a feed, or creating another reason to remain on the phone."],
  ["Phone and direct dialing", "The phone returning to its original role: helping one person reach another quickly and clearly."],
  ["Messages", "Direct communication instead of passive consumption. It keeps conversations close without turning the home screen into an attention dashboard."],
  ["Maps", "A modern necessity preserved as a tool. Navigation stays available without making location-based discovery or recommendations the center of the experience."],
  ["The built-in camera", "The ability to capture a moment without entering a separate attention-heavy interface. Photo, video, and a local gallery remain part of one contained task."],
  ["Google search", "The wider internet remains available when the user intentionally asks for it. Search is a doorway, not a permanent stream placed on the home screen."],
  ["The finite app drawer", "Installed apps remain reachable, but they are presented as a stable list rather than a promotional surface or an endlessly rearranged recommendation system."],
  ["Keypad and D-pad navigation", "A physical, predictable relationship between intention and action. Stable controls build muscle memory and reduce ambiguous gestures."],
  ["Multi-tap search", "A classic input pattern adapted for modern app discovery. It allows the keypad to remain useful without requiring a full software keyboard for every small task."],
  ["The Nokia-style keyboard", "A deliberate alternative input method. It preserves keypad rhythm and clear character selection while remaining optional at the Android system level."],
  ["Direct system settings", "Control without duplication. Display, sound, keyboard, Digital Wellbeing, and privacy actions lead to the Android controls that already govern the device."],
  ["The live status area", "Useful awareness without the noise of the conventional status bar. Network, Wi-Fi, Bluetooth, VPN, sound, notifications, charging, power saving, and battery are shown only as compact state."],
  ["Portrait-only layout", "Consistency over novelty. The screen and keypad keep a dependable relationship instead of reorganizing themselves whenever the device turns."],
  ["Local-first behavior", "The phone remains the primary home of its information. The design favors on-device actions, minimal data handling, and permissions tied to understandable features."],
];

const PRINCIPLES = [
  ["Utility over engagement", "Success means the user completed a real task, not that the session became longer."],
  ["Deliberate interaction", "Clear modes, explicit controls, and finite destinations replace feeds, autoplay, and accidental journeys."],
  ["Nokia-era calm", "Restraint, legibility, muscle memory, and dependable behavior matter more than novelty."],
  ["Modern minimalism", "The past is interpreted rather than copied blindly. The result should remain polished, accessible, and useful on a modern Android phone."],
  ["Capability without temptation", "Contemporary apps stay reachable, but distracting applications do not dominate the default experience."],
  ["Fast and predictable", "Inputs should feel immediate, layouts should remain stable, and decorative motion should never delay a task."],
  ["Privacy by default", "Prefer local processing, minimal permissions, and no attention or behavioral tracking."],
];

const About = () => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "About Nokia Launcher";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-6 font-mono" data-testid="about-page">
      <article className="max-w-4xl mx-auto">
        <header className="border-b border-white/20 pb-8 mb-10">
          <p className="text-xs uppercase tracking-[0.28em] text-lime-300/70 mb-4">About Nokia Launcher</p>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Modern capability without modern-phone addiction.
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed max-w-3xl">
            Nokia Launcher brings the modern smartphone back to the calmer Nokia era—when a phone was a dependable tool and habitual phone addiction was not treated as normal—while retaining a refined, modern minimalist feeling.
          </p>
        </header>

        <section className="mb-12 space-y-5 text-white/80 leading-relaxed">
          <h2 className="text-2xl font-bold text-white">Why this exists</h2>
          <p>A modern smartphone is extraordinarily capable, but its default interface is often built around interruption. Notifications compete for attention. Home screens become crowded. Feeds do not end. Applications are arranged to be opened repeatedly, and the smallest task can become an unplanned session.</p>
          <p>Nokia Launcher begins from a different belief: the phone should help a person do what they intended and then become easy to leave. Calling someone, replying to a message, finding a route, taking a photograph, checking a setting, or opening a necessary app should remain quick. Nothing around those actions needs to manufacture another reason to stay.</p>
          <p>The Nokia-era interaction model is a means, not the final goal. The deeper purpose is a calmer relationship with technology—one based on choice, finite actions, stable controls, and confidence that the device will behave the same way tomorrow.</p>
        </section>

        <section className="mb-12 p-6 border border-lime-200/25 bg-lime-200/[0.04]">
          <h2 className="text-2xl font-bold mb-4">The product promise</h2>
          <p className="text-xl leading-relaxed text-white/90">Preserve the useful powers of a contemporary Android phone while removing the patterns that encourage compulsive checking, passive consumption, and unnecessary time on screen.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">The principles behind every decision</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map(([title, body]) => (
              <div key={title} className="border border-white/15 p-5">
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-white/70 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-3">What the functions represent</h2>
          <p className="text-white/70 leading-relaxed mb-7">Each function has a practical job and a philosophical role. Features are not added merely because another launcher has them; each one must support a real task while protecting the calm of the whole system.</p>
          <div className="space-y-4">
            {FUNCTION_MEANINGS.map(([title, body], index) => (
              <div key={title} className="grid md:grid-cols-[3rem_15rem_1fr] gap-2 md:gap-5 border-t border-white/15 pt-4">
                <span className="text-white/35">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="font-bold">{title}</h3>
                <p className="text-white/70 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 space-y-5 text-white/80 leading-relaxed">
          <h2 className="text-2xl font-bold text-white">Not a nostalgic costume</h2>
          <p>Nokia Launcher borrows the calm, legibility, physical logic, and dependable behavior associated with classic phones. It does not attempt to recreate every limitation of an old handset or turn the phone into a novelty prop.</p>
          <p>A useful modern interpretation must still support current Android applications, maps, camera capture, video, device settings, connectivity states, privacy controls, and accessible touch interaction. Nostalgia never outranks clarity, reliability, or the ability to complete a real task.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-5">What is intentionally absent</h2>
          <ul className="grid gap-3 md:grid-cols-2 text-white/75">
            <li className="border-l-2 border-white/20 pl-4">Infinite feeds and endless discovery surfaces</li>
            <li className="border-l-2 border-white/20 pl-4">Autoplay and algorithmic recommendations</li>
            <li className="border-l-2 border-white/20 pl-4">Streaks, rewards, badges, and artificial urgency</li>
            <li className="border-l-2 border-white/20 pl-4">Decorative motion that delays an action</li>
            <li className="border-l-2 border-white/20 pl-4">Home-screen clutter and unnecessary choice</li>
            <li className="border-l-2 border-white/20 pl-4">Monetization dependent on maximizing attention</li>
          </ul>
        </section>

        <section className="mb-12 space-y-5 text-white/80 leading-relaxed">
          <h2 className="text-2xl font-bold text-white">Privacy and permissions</h2>
          <p>Nokia Launcher is designed around local device behavior. Installed-app information is used to build the app drawer and launch applications. Camera and microphone access support photo and video capture. Phone permission supports direct calls. Notification, audio, network, and battery access support the launcher functions that visibly depend on them.</p>
          <p>Optional Android Accessibility Service accesses the foreground app and its interface content for Nokia-key navigation, scrolling and selection, Back, Recent Apps and screen lock. During Dumb Mode it detects selected blocked apps and returns Home, even when Nokia Launcher is not on screen. This Accessibility data is processed locally and is not stored as a screen history or sent to the developer or billing providers. A separate in-app disclosure asks for your agreement before activation; you can decline or disable the service in Android Settings.</p>
          <p>Built-in communication tools use the permissions associated with contacts, SMS, direct calls and recent calls. Optional notification access supports status indicators, supported conversations and replies. Feature availability depends on Android permissions and platform requirements.</p>
          <p>Where billing is enabled, Google Play and RevenueCat process transaction information to validate and restore Monthly, Yearly or Lifetime access. These purchases are separate from Accessibility access. See the Privacy Policy for data handling, providers and your choices.</p>
          <p>Permissions should remain understandable, proportionate, and connected to a feature the user deliberately invokes. The product is not designed around advertising profiles, behavioral tracking, or selling attention.</p>
        </section>

        <section className="mb-12 space-y-5 text-white/80 leading-relaxed">
          <h2 className="text-2xl font-bold text-white">The product foundation</h2>
          <p>The foundation is the visual language, the launcher and keypad relationship, the focused home screen, the finite app drawer, direct settings, system status, deliberate search, direct dialing, and a built-in camera that belongs to the same calm system.</p>
          <p>Future features should not make this foundation busier. They should deepen reliability, accessibility, privacy, and usefulness. A new capability belongs only when it helps someone perform a real task, remains finite and easy to exit, and can be expressed with less noise rather than more.</p>
        </section>

        <footer className="border-t border-white/20 pt-8 text-sm text-white/55 leading-relaxed">
          <p className="mb-4">Nokia Launcher is an independent project and is not affiliated with, endorsed by, or sponsored by Nokia Corporation or HMD Global.</p>
          <nav className="flex gap-5">
            <a className="text-white/80 underline" href="/privacy">Privacy</a>
            <a className="text-white/80 underline" href="/terms">Terms</a>
          </nav>
        </footer>
      </article>
    </main>
  );
};

export default About;
