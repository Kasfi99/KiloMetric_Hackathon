import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

// Edge-to-edge Android no longer shrinks the window for the keyboard (keyboard-controller is not in Expo Go).
// This scrolls the focused input above the keyboard and pads the content so it can scroll there.
const GAP = 24;
type Reveal = () => void;
const RevealContext = createContext<Reveal>(() => {});
export const KeyboardReveal = RevealContext.Provider;
export const useRevealOnFocus = () => useContext(RevealContext);

export function useKeyboardAware() {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0), keyboardTop = useRef<number | null>(null);
  const [bottomInset, setBottomInset] = useState(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current, input = TextInput.State.currentlyFocusedInput();
    if (top == null || !input) return;
    // Wait a frame so the layout (and any window resize) has settled before measuring.
    requestAnimationFrame(() => input.measureInWindow((_x, y, _w, h) => {
      const overflow = y + h - (top - GAP);
      if (overflow > 0) scrollRef.current?.scrollTo({ y: offset.current + overflow, animated: true });
    }));
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => { keyboardTop.current = e.endCoordinates.screenY; setBottomInset(e.endCoordinates.height); reveal(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; setBottomInset(0); });
    return () => { show.remove(); hide.remove(); };
  }, [reveal]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = e.nativeEvent.contentOffset.y; }, []);
  return { scrollRef, onScroll, bottomInset, reveal };
}
