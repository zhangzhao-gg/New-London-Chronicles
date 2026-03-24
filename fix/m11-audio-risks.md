# M11 Audio System - Remaining Risks and Potential Bugs

## Remaining Risks

1. Missing local audio assets
- Current ambient and lo-fi paths are interface placeholders only:
  - `/audio/ambient/focus.mp3`
  - `/audio/ambient/chill.mp3`
  - `/audio/ambient/rest.mp3`
  - `/audio/music/*.mp3`
- Until real files are added under `public/audio/`, playback will degrade gracefully but remain silent.

2. Browser autoplay policy
- Browsers may reject `audio.play()` until the user performs a trusted interaction.
- This is handled without crashing, but the first playback attempt may still require an explicit click.

3. Native audio error granularity is limited
- `HTMLAudioElement` error events do not reliably distinguish between all failure causes.
- We now separate interrupted play requests from real availability failures, but hard failures still collapse into a generic “resource unavailable” path.

4. Component not yet mounted on the real Focus page
- `components/focus/MusicPlayer.tsx` is implemented and build-valid.
- It is not yet mounted by `app/focus/page.tsx` because that file was explicitly out of scope for M11.
- Real page-level interaction verification must happen once M10 wires it in.

## Potential Bugs / Follow-ups

1. Rapid ambient switching during ongoing fade
- Request-token protection now prevents stale async `play()` completions from rolling playback back to an older ambient track.
- Still worth manually testing on slower devices to confirm the perceived fade remains smooth under repeated taps.

2. Native `error` event race after a newer selection
- We protect async `play()` races, but browser `error` events are still global to the element lifecycle.
- If future requirements need stricter correctness, errors could be tied to per-request context before mutating shared readiness state.

3. Music track change while a previous play promise is pending
- Request tokens also protect music play state from stale completions.
- Worth validating in-browser with repeated previous/next taps once real assets are present.

4. Generic user-facing error copy
- Current messages intentionally stay low-noise and generic.
- If product later wants sharper UX, consider splitting display states into:
  - missing asset
  - autoplay blocked
  - playback interrupted

5. No persistence by design
- Audio state is intentionally client-only and non-persistent per module contract.
- Refreshing or remounting will reset audio state unless a future module explicitly introduces persistence.

## Recommended Manual Verification After M10 Integration
- Mount `MusicPlayer` on the real Focus page.
- Verify `focus -> chill -> rest` rapid taps do not roll back to an older ambient sound.
- Verify `AbortError`-style interrupted playback no longer marks assets as unavailable.
- Verify missing audio files only show graceful fallback messaging and never crash the page.
- Verify volume changes affect only lo-fi music, not ambient sound.
