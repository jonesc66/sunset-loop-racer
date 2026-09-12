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
    (target instanceof HTMLInputElement && target.dataset.raceControls !== "true") ||
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
      inputRef.current.resetRequested = false;
    };

    const setKey = (event: KeyboardEvent, isDown: boolean) => {
      if (isTextEntryElement(event.target) || isTextEntryElement(document.activeElement)) {
        clearInput();
        return;
      }
      const fallback: Record<number, string> = { 87: "KeyW", 65: "KeyA", 83: "KeyS", 68: "KeyD", 82: "KeyR", 32: "Space", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown" };
      const code = event.code || fallback[event.keyCode] || "";
      if (
        code === "Space" ||
        code === "KeyW" ||
        code === "KeyA" ||
        code === "KeyS" ||
        code === "KeyD" ||
        code === "KeyR" ||
        code.startsWith("Arrow")
      ) {
        event.preventDefault();
      }

      switch (code) {
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
    document.addEventListener("visibilitychange", clearInput);

    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", clearInput);
    };
  }, []);

  return inputRef;
}
