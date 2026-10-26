# Product

## Register

product

## Users

**Students (public, no login).** Three groups sharing one library:

- **School students, Class 10, 11, 12**: Maths and Computer Science. Mostly on phones, often mid-range Android on patchy mobile data. Arrive to revise a topic, rewatch a lecture, or grab notes before a test. Frequently studying late at night.
- **Computer Engineering students**: C, C++, Java, Python. Looking up a specific concept or lab topic, often mid-assignment.
- **Working professionals**: AI engineers, cloud engineers, backend engineers upskilling. Short, focused sessions; know what they want and expect to find it fast.

Job to be done: find the right lesson in seconds, watch the lecture, download the PDF notes. No account, no friction.

**Tutor (admin, password-protected `/admin`).** Single person managing the library: uploads PDF notes, adds YouTube lecture links, edits and removes lessons. Infrequent but repetitive data entry; wants it fast and hard to get wrong.

## Product Purpose

A neutral, fast lesson library. Every lesson pairs an embedded YouTube lecture with downloadable PDF notes, organized by level/track and subject, and searchable. The material is the product; the site gets out of its way.

Success: a student on a slow phone goes from landing to watching the right lecture or holding the PDF in a couple of taps. The tutor adds a lesson in under a minute without errors.

## Brand Personality

Friendly, encouraging, clear. Feels like a good study app rather than a portal or a sales funnel: warm, a bit of color and character, never loud. Calm enough for a 1am revision session, approachable for a 15-year-old, credible for a senior engineer. The tutor is present lightly (name, photo, short bio on the home and About pages, small card beside lessons); the library stays the star, with no marketing or sales voice.

Reference lane: friendly study apps (Khan Academy, Brilliant) for warmth and encouragement, without their gamification.

## Anti-references

- **Coaching-class ads** (Byju's, Unacademy style): loud banners, toppers' photos, urgency, countdowns, sales popups.
- **Generic SaaS landing**: hero + gradient + feature-card grid + testimonials.
- **YouTube clone**: endless thumbnail wall, autoplay, recommendation feed, engagement bait. (A short, filterable "latest lessons" grid is fine.)
- **Dated LMS** (Moodle, college portals): gray tables, tiny text, nested menus, login walls.

## Design Principles

1. **Lesson in two taps.** Every screen is judged by how fast it gets a student to the lecture or the PDF. Search and filtering are first-class, not afterthoughts.
2. **Respect the slow phone.** Weight is a design decision. Ship minimal JS, defer heavy embeds until asked for, keep pages small enough for 3G.
3. **Warm, not loud.** Encouragement comes from clarity and small human touches, never from urgency, badges, or noise.
4. **One library, many learners.** A Class 10 student and a backend engineer use the same structure; tracks and levels separate them without making either feel out of place.
5. **Admin that prevents mistakes.** The tutor's tools favor clear previews, validation, and confirmation over speed tricks.

## Accessibility & Inclusion

- WCAG 2.2 AA: contrast, full keyboard support, visible focus, screen-reader labels, `prefers-reduced-motion` respected.
- Low-end devices and slow data are a primary constraint: lightweight YouTube facade instead of eager iframes, small pages, no heavy client frameworks on public pages.
- Light and dark themes, both first-class (late-night study is common).
