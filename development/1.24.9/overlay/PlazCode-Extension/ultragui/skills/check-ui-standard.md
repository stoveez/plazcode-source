# check-ui-standard

Use this user-provided reference only when it helps the current project request. Adapt paths, assets, style and APIs to the actual project and available PlazCode tools. The current user scope takes priority. Keep working features. Do not impose extra search loops or ask the user to continue after every component. Use actual tests when tools permit; report what remains untested.

When relevant: building a cartoon, simulator or tycoon interface, or when the user names Check-UI. Full recipes: references/check-ui/SKILL.md (or --full).

Core rules. Every one is non-negotiable.
1. Font: every text object uses Enum.Font.GothamBlack, with a black UIStroke 2.0 to 3.5 px,
   scaled to the text size.
2. Window canvas: solid Color3.fromRGB(59, 88, 102) (#3B5866), BackgroundTransparency 0, with
   a 4 px UICorner and an outer UIStroke of 3.5 px in #181E22. Never semi-transparent.
3. Close button: a 38 x 38 px square. Dark burgundy bevel #730010 under the face (the reference
   code uses 4 px). Face gradient #FF7DAF to #FF1428 at 90 degrees. Inner pastel stroke #FFD2EB,
   1.2 px. White GothamBlack "X" with a black stroke. A child UIScale.
4. Header: 60 px tall. It ends with a two-line divider: a 3 px dark thematic bar, then a 3 px
   solid black bar.
5. Checkerboard: rbxassetid://385956923 at full height. Vertical UIGradient transparency
   1 -> 0.82 -> 0.35 -> 0.10, so there are no hard edges.
6. Icons: ScaleType = Enum.ScaleType.Fit. Never stretched.
7. Responsive: factor = min(ViewportSize.X / 1050, ViewportSize.Y / 620), clamped to 0.52 to 1.18,
   applied to a UIScale on each window and HUD.
8. Centre anchor: every interactive element has AnchorPoint (0.5, 0.5) and a child UIScale, so
   hover and press scale from the centre.
9. Five archetypes: Shop, Codes, Rebirth, Settings, Daily Rewards. Each has its own header gradient:
   Shop #FF1496 -> #E10019; Codes #00CDFF -> #0082F5; Settings #FFFFFF -> #D7DEE8; Rebirth
   #A000FF -> #6000C8; Daily Rewards #98FF00 -> #50D000. Every header is 60 px with the same divider.
10. Iconless buttons (Throw, Action, Jump, Redeem, Confirm, Ok): sharp 90-degree corners with NO
   UICorner. A 3 px #0C141A border. A 90-degree gradient. A black checkerboard overlay fading
   0.91 -> 0.62. Three inner highlight frames inset 2, 4 and 6 px, with white 1 px strokes at
   transparency 0.25, 0.45 and 0.80. A centred white GothamBlack label with a 3 px #11171A stroke
   and a 1 px upward optical lift.
11. Button states: Claim/Buy lime #B4FF19 -> #69E100, bevel #0F780F. Claimed silver #D8DEE4 ->
   #94A0B0, bevel #485260. Locked crimson #FF2050 -> #D00020, bevel #700010. Skip amber #FFD000 ->
   #FF8C00, bevel #994C00. Music/feature hot pink #FF1480 -> #D40055, bevel #780A2D.
12. Every button has a 3 px dark bottom bevel.
13. Sunbursts rotate at 20 degrees per second, and only while their window is visible.

Palette (Color3 RGB): canvas 59,88,102; outline 24,30,34; card 26,44,52; card highlight 75,125,145;
requirements box 20,34,42; close bevel 115,0,16; close highlight 255,210,235.

Asset IDs in the reference: checkerboard 385956923; sunburst 130563114903838; cash 88694661500877;
player 77589096360120; Robux 132185731364109. Confirm each loads before you use it, and keep the IDs
in a Config module, not inside a service. The reference lists 6895079853 for both hover and click
sound. That looks like a copy error, so confirm the click sound ID.

Known gaps in the reference code: the responsive and animation samples use playerGui, playSound,
hoverSound, clickSound, RunService and TweenService without defining them. Define them before use.
The CheckUIIcons registry (1,022 icons under ReplicatedStorage.CheckUI) is not in this project. Do not
reference it unless the user adds it.

Checklist for every Check-UI screen: all text GothamBlack; canvas solid #3B5866; close button 38 x 38;
header divider two-tone; checkerboard with a four-point gradient; icons Fit; centre anchors on all
interactive elements; responsive factor clamped to 0.52 to 1.18; the screen is one of the five
archetypes; iconless buttons use the sharp-corner recipe.