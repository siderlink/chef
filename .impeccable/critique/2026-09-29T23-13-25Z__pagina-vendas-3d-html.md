---
target: pagina-vendas-3d.html
total_score: 20
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\computer\\Desktop\\chef cozinha\\pagina-vendas-3d.html"
target_fingerprint: "sha256:f8cd527205b06402a9a653e328191cdad804af4609065697eed488f7c6f906ba"
target_path: "C:\\Users\\computer\\Desktop\\chef cozinha\\pagina-vendas-3d.html"
timestamp: 2026-09-29T23-13-25Z
slug: pagina-vendas-3d-html
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Excellent thematic execution with live interactive widgets. |
| 2 | Match System / Real World | 4 | Translates physical restaurant chaos into a digital journey perfectly. |
| 3 | User Control and Freedom | 3 | Sticky 8-step journey tracker lacks visible scroll affordance on mobile. |
| 4 | Consistency and Standards | 4 | Typography and colors are tightly controlled and thematic. |
| 5 | Error Prevention | n/a | Marketing page; minimal user input outside of standard interaction. |
| 6 | Recognition Rather Than Recall | 3 | Journey tracker keeps the narrative linear and easy to follow. |
| 7 | Flexibility and Efficiency | n/a | Landing page flow; efficiency is not the primary goal. |
| 8 | Aesthetic and Minimalist Design | 2 | Maximalist design; heavy glassmorphism over WebGL risks visual clutter. |
| 9 | Error Recovery | n/a | Landing page flow; no deep error states to recover from. |
| 10 | Help and Documentation | n/a | Landing page; help is embedded in the marketing copy. |
| **Total** | | **20/24** | **Good** |

#### Design Specificity Verdict

**LLM assessment**: The layout is tightly bound to the "Quantum/Telemetry" restaurant concept. The use of a journey tracker and interactive widgets is excellent for "showing, not telling." However, the aesthetic leans heavily into dense glassmorphism over moving 3D elements, which hurts legibility.

**Deterministic scan**: The detector found 37 issues. The highest offenders are `dark-glow` (9) and `nested-cards` (8), along with `all-caps-body` (5) and `side-tab` (3). The page relies heavily on glowing shadows and transparent borders, which contributes to the "cluttered" feeling and reduces the premium feel. 

#### Overall Impression
The structural narrative (the 8 stations of a restaurant) is brilliant and engaging. However, the visual execution is visually noisy, relying too heavily on glows, nested dark cards, and glassmorphism that competes with the 3D canvas behind it. 

#### What's Working
1. **Thematic Consistency**: The telemetry stats and interactive widgets ground abstract tech promises in reality.
2. **The Journey Tracker**: Structuring the page as an 8-step timeline is an excellent way to explain a complex ERP system.

#### Priority Issues
- **[P1] Visual Clutter & Glow Overuse**: The interface relies on 9 instances of `dark-glow` and heavy glassmorphism (`rgba(20, 20, 20, 0.65)`). This makes the UI feel like a gaming dashboard rather than a premium B2B software tool.
  - *Why it matters*: High cognitive load; it makes text hard to read against the 3D background.
  - *Fix*: Remove excess glowing shadows, increase opacity on card backgrounds, and simplify borders.
  - *Suggested command*: `/impeccable quieter`
- **[P1] Hidden Affordances**: The journey tracker hides its scrollbar.
  - *Why it matters*: Mobile users may not realize there are 8 steps to explore.
  - *Fix*: Expose standard scrollbars or add visible arrow indicators.
  - *Suggested command*: `/impeccable polish`
- **[P2] Hero Layout Imbalance**: `.hero-section` uses `max-width: 58%`.
  - *Why it matters*: On wide screens, if the 3D model takes time to load, the page looks broken and lopsided.
  - *Fix*: Balance the grid or ensure a graceful fallback background.
  - *Suggested command*: `/impeccable layout`

#### Persona Red Flags
**Jordan (First-Timer)**: The heavy use of "telemetry" aesthetics, pulsing dots, and glassmorphism might make the system look too complex for an average restaurant owner who just wants simple control over their business.
**Casey (Distracted Mobile User)**: The hidden scrollbar on the journey tracker means they will likely miss the 8-step narrative entirely if they don't accidentally swipe it.

#### Minor Observations
- The "Simular Chamado" button interaction is a great idea, but the dark widgets inside dark cards lack sufficient contrast.
- The typography mixes Space Grotesk and Plus Jakarta Sans beautifully, but gradient text (`gradient-text`) adds unnecessary visual noise.

#### Questions to Consider
- Does the "command center" vibe communicate efficiency, or does it scream "steep learning curve" to a traditional restaurant owner?
- What happens to the readability if the 3D WebGL background fails to load or stutters on a low-end device?
