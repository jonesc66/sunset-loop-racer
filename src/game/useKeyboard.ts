import { useEffect, useRef } from "react";
import type { InputState } from "./types";

const initialInput: InputState = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
  resetRequested: false
};

function isTextEntryElement(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useKeyboard() {
  const inputRef = useRef<InputState>({ ...initialInput });

  useEffect(() => {
    const clearInput = () => {
      inputRef.current.accelerate = false;
      inputRef.current.brake = false;
      inputRef.current.left = false;
      inputRef.current.right = false;
      inputRef.current.handbrake = false;
    };

    const setKey = (event: KeyboardEvent, isDown: boolean) => {
      if (isTextEntryElement(event.target) || isTextEntryElement(document.activeElement)) {
        clearInput();
        return;
      }
      if (
        event.code === "Space" ||
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD" ||
        event.code === "KeyR"
      ) {
        event.preventDefault();
      }

      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          inputRef.current.accelerate = isDown;
          break;
        case "KeyS":
        case "ArrowDown":
          inputRef.current.brake = isDown;
          break;
        case "KeyA":
        case "ArrowLeft":
          inputRef.current.left = isDown;
          break;
        case "KeyD":
        case "ArrowRight":
          inputRef.current.right = isDown;
          break;
        case "Space":
          inputRef.current.handbrake = isDown;
          break;
        case "KeyR":
          if (isDown && !event.repeat) {
            inputRef.current.resetRequested = true;
          }
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);

    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", clearInput);

    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", clearInput);
    };
  }, []);

  return inputRef;
}
