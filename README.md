# Family AI Game Day — standalone phone app (v2.1)

**Team 468 | Code: JLWEO** · Abu Dhabi University Family AI Game Day · Advanced (Champions) track

A family chooses the fun. The app hosts it, and an **AI judge that runs inside the phone** watches and listens to real play, applies the rules, and keeps score. There is no server, no laptop and no upload: the videos never leave the phone.

## What it does

The app has six screens:

1. Choose a game
2. Players & teams
3. Rules & ready
4. Round in play
5. AI judge results
6. Final results

| Game | Type | AI signal | What the on-device AI judges |
|------|------|-----------|------------------------------|
| **Football** (required) | Team | Video | Tracks each player by bib colour and the ball, detects goals (the ball enters a goal zone), and times possession. **MVP = the player with the ball for the longest time.** |
| **Al-Sana'a & Majlis Proverb Duel** | Individual or team | Audio | Times when the player starts answering, and checks the spoken ending of the proverb using the phone's speech recognition. |
| **Pearl Diver's Balance Hold** | Individual or team | Video | Measures how long each player stays steady in the pearl-diver pose, lane by lane. |
| **Souq Treasure Scavenger Sprint** | Team | Video | Spots the first team (left or right half of the picture) to hold up an item of the called colour. |
| **Falcon Reflex & Call Challenge** | Individual or team | Video + audio | Hears the falcon whistle in the clip, then times each lane's first raised hand. Moving before the whistle is a false start. |

On the results screen, the app shows the game moment and the reason for it. You can **replay the clip with the AI's detections drawn on top**, see evidence frames, and see exactly what "Apply AI results" will change.

Each report carries an integrity code (`JLWEO-<SHA-256>`). The app re-checks it before any score changes, and the **Tamper test** button shows that an edited report is rejected.

## Put it on the phone (about 5 minutes, free)

Phones only allow the camera on an `https://` page, so the folder must be hosted once. No server code runs: it is just files.

**GitHub Pages (recommended — the repository link can also serve as the source-folder submission link):**

1. Sign in at github.com → **New repository** → name it `family-ai-game-day` → **Public** → **Create repository**.
2. Click **uploading an existing file**. Drag in **all files and the `demo_media` folder** from this unzipped folder (not the zip itself) → **Commit changes**.
3. Go to **Settings → Pages**. Under **Source**, choose **Deploy from a branch**, branch **main**, folder **/ (root)** → **Save**.
4. After about 1 minute, the app is live at `https://<your-username>.github.io/family-ai-game-day/`.
5. On the phone, open that link, then install it:
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ → **Add to Home screen** / **Install app**.

   After the first visit the app opens without internet. Only the proverb word check needs internet.

**Netlify Drop (alternative):** drag the folder onto app.netlify.com/drop to get an https link. Sign-in or expiry rules may apply (not verified).

**Quick test on a computer without hosting:** run `python -m http.server 8000` in this folder and open `http://localhost:8000` in Chrome.

## Playing a round on the phone

1. Pick a game, players and rules. Then press **Everyone ready**.
2. On **Round in play**, there are two ways to record:
   - **In-app (best):** **Start camera** → **● Record** → play → **■ Stop**. Hold the phone sideways (landscape) and keep it still.
     - *Proverb:* the proverb appears when recording starts. With internet, the phone's speech recognition captures the words.
     - *Falcon:* the app plays the whistle at a random moment. Turn the volume up.
   - **Phone camera app:** on screen 5, choose **Phone camera / saved clip**, then **📹 Record with phone camera** or **📁 Choose an existing clip**.
     - For Falcon, play the whistle from a **second device** with the app open (**🦅 Play whistle** button).
3. **Run the AI judge.** A progress percentage is shown, and judging takes about as long as the clip or longer (see limits).
4. Check the green **Report verified** card → **Apply AI results** (once per report) → next round or final results.

### Football on a real pitch (v2.1 — goals are judged against goals YOU mark)

**1. Set up the camera**

- Fix the phone so it does not move: a stand, a chair back, or taped to a wall. If the phone moves after marking, the marks are wrong.
- Put it **high** (at least about 1 m, higher is better) and **side-on**, so it sees the whole pitch and **both goals completely**, including where each post touches the ground.
- Each goal mouth must be seen **at an angle**, not straight along the goal line.
- Landscape orientation, in good light.
- Use bright bibs of different colours and a bright ball whose colour nobody is wearing. Turn iPhone HDR Video off.

**2. Mark the goals and colours (screen 5)**

1. Record or choose the clip.
2. Press **Load a frame**.
3. Choose **"Left goal: post 1 base"** and tap where that post meets the ground. Repeat for post 2, then for both posts of the right goal. The yellow line shows the goal line the AI will use.
4. Pick each bib (P1–P4) and the BALL by tapping them in the frame.

Marks are kept for the next rounds while the phone stays in place. Use **Clear all marks** if it moved.

**3. What counts**

| The AI sees… | Result |
|---|---|
| The ball's ground point move from the pitch side to behind the marked line, between the posts, by at least one ball-width, and stay there for 2 frames | **Goal** |
| The crossing is hidden; the ball vanishes at the line; the crossing is right next to a post; or the goal line is too foreshortened on screen | **Possible goal**: the AI does not count it, and the host must press **Goal ✓** or **No goal ✗** before scores can be applied (recorded as a HOST decision) |
| The ball crosses the line's extension outside the posts | **Near miss**: listed, no goal |
| The ball stays still near the goal, passes beside or in front of it, touches the line and comes back, or is already behind the line without being seen crossing | **No goal** |

- If no goals are marked, goals are **not judged** at all.
- After a goal, the same goal cannot count again until the ball has been back on the pitch for 0.5 s.
- **Honest limit:** one phone camera gives a 2D picture. The AI uses the ball's ground point against the marked line, which is right for a ball rolling on the ground. It **cannot prove in 3D** that the whole ball crossed the line, especially for lofted shots. Uncertain views are flagged for the host instead of counted.

**Camera tips (all games):**

- Fixed phone.
- Landscape.
- The whole play area in view.
- Bright, distinct colours.
- iPhone HDR Video off.

### Do the other games judge real play? (audit)

| Game | Judges real physical play? | Assumptions you must meet on a real recording |
|---|---|---|
| Pearl Diver | Yes: real movement in each lane | Players stand in **equal side-by-side lanes in player order** (the replay shows the lane lines). Fixed camera. Thresholds were tuned on synthetic clips and are **unvalidated on real people**; breathing or loose clothing could end a hold early. The AI measures stillness, not the pose itself. The host should watch the replay. |
| Souq Sprint | Yes: real coloured objects | Team A searches in the **left half**, Team B in the **right half**. The target colour must be strong, and no one may wear it. The item must fill about 1.5% or more of a half (hold it up close). Time counts from the start of the clip, not from the call. |
| Falcon Reflex | Yes: real whistle in the audio, real movement per lane | Lanes as in Pearl. The whistle must be audible in the clip. Fidgeting before the whistle can count as a false start. Thresholds are unvalidated on real people. |
| Proverb Duel | Yes: real voice | The words need in-app recording, the browser's speech recognition and internet. Speech-start timing works on any clip. |
| Football | Yes after v2.1: real goal geometry from your marks | Requirements are listed above. |

All lane and half splits are **fixed equal divisions of the picture**, so players must be arranged to match them. This is a setup rule, not detection of where people are.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App page |
| `app.js` | The six screens, recording, calibration, results, replay, tamper test, scoring flow |
| `judge.js` | **On-device AI judge**: frame sampling, colour and motion vision, audio analysis (FFT whistle detection, speech timing), Arabic answer matching, report integrity code |
| `rules.js` | Game catalogue, proverb list (editable), points, tie-breaks, MVP |
| `style.css` | Styling |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installable app + offline support |
| `demo_media/` | **Synthetic, labelled** test clips and `ground_truth.json` (for testing only; not real gameplay) |

Nothing else is needed: no installation, no Python, no API keys.

## Test evidence (v2.0, run by Claude in desktop Google Chrome — not on a physical phone)

All five synthetic demo clips were judged on-device in the app and compared with the generator's ground truth:

| Game | Ground truth | App result |
|------|--------------|------------|
| Football — score | 2–1 | 2–1 |
| Football — scorers | P1, P4, P1 | P1, P4, P1 |
| Football — MVP | P1 | P1 |
| Football — possession | P1 9.5 s | P1 10.4 s (overcounts by up to 0.8 s) |
| Pearl — holds | 7.0 / 11.0 / 3.5 / 14.0 s | 7.0 / 11.0 / 3.5 / 13.9 s |
| Souq | B at 4.2 s, A at 5.6 s | exact |
| Falcon — whistle | 3.50 s | 3.49 s |
| Falcon — reactions | 0.45 / 0.30 / 0.60 s | 0.51 / 0.36 / 0.66 s (about 0.06 s late); false start found |
| Proverb — speech start | 2.00 s | 2.01 s |

Other checks:

- **Tamper test:** an edited report is REJECTED.
- **Full football flow:** apply → final "Team A wins 2-1", MVP P1.
- **In-app recording** with Chrome's fake camera was judged and verified.
- **Code checks:** the SHA-256 matches Node's crypto, and proverb matching handles right, wrong and partial answers.
- **Layout:** no sideways scrolling at phone width (emulated).

## Known limits (honest)

- **Not yet tested on a real phone.** Test on your phone before the demo (see the checklist below).
- **Speed:**
  - A 30-second football clip took about 58 s to judge in desktop Chrome. Phones may be slower.
  - Keep clips short: 20–40 s per round.
- **Proverb words:**
  - The words need the in-app recorder plus internet. The phone's speech recognition may send audio to its provider. Without words, the app still times the answer but cannot judge it.
  - The synthetic demo clip has no real words.
- **Integrity code:**
  - It detects any change to a saved report.
  - Because the judge runs inside the app, it is **not** proof against someone who modifies the app itself.
- **What the AI recognises:**
  - Football players by **bib colour**, not shirt numbers.
  - Pearl diver: **stillness**, not the exact pose.
  - Souq: **colour**, not object type.
- **Falcon:** needs the whistle in the clip's sound. If an iPhone cannot read the sound of a clip, the Falcon and Proverb games cannot be judged (not verified).
- **Accuracy figures** come from synthetic clips. Real-world accuracy depends on light, colours and camera angle.

## v2.1 goal-line evidence (SYNTHETIC only — real footage still required)

**Simulated ball-track logic test** (no video; Node):

| Scenario | Result |
|---|---|
| Genuine goal | 1 goal |
| Near miss wide of the post | Near miss, no goal |
| Ball beside the goal | Nothing |
| Stationary ball near the line | Nothing |
| Ball hidden while crossing | Host review |
| Ball placed behind the line | Nothing |
| Goal, then bouncing in the net | 1 goal |
| Touches the line and comes back | Nothing |
| Crosses next to a post | Host review |
| Two separate goals | 2 goals |
| Ball lost at the line | Host review |

**Synthetic demo clip, in Chrome:**

- With the posts marked by tapping the frame: 2–1, crossings at 4.41 s, 12.29 s and 27.8 s; no reviews, no false goals.
- With no marks: "Goals were NOT judged" and score 0–0.

**Real-footage test protocol (do this before relying on football).** Record one fixed-camera clip on your real pitch, mark the goals, and judge it. It must contain:

1. **A genuine goal**, rolled in mid-goal → expect a Goal.
2. **A near miss** just wide of a post → expect a Near miss and no goal.
3. **A ball rolling beside or in front of the goal** without crossing → expect no goal.
4. **A ball left still near the goal line** for 5 s → expect no goal.
5. **A crossing where a player blocks the camera's view** of the ball → expect a Possible goal (host review), not an automatic goal.

Write down what the app reported for each, and take screenshots. That, not the synthetic results, is the evidence that football works.

## 5-minute phone check before the demo

1. Open the https link → choose Football → Demo clip → **Run the AI judge** → expect "Team A 2–1", the verified card, and the replay overlay.
2. **Tamper test** → expect REJECTED. Then **Apply AI results** → the score updates.
3. Start camera → record 10 s → judge it (any game) → expect a verified report.
4. Falcon: record in-app with the volume up → expect "Whistle heard".
5. Turn on airplane mode, reopen the app from the home screen → expect it to open (offline).

## Credits

Written for Team 468's entry with AI assistance (see the team's AI chats PDF). There are no third-party libraries, external images or fonts. The demo clips are synthetic and generated by code.
