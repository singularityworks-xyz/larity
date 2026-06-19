import WS from "ws";

const originalDescriptor = Object.getOwnPropertyDescriptor(WS.prototype, "binaryType");
if (originalDescriptor) {
  Object.defineProperty(WS.prototype, "binaryType", {
    get() {
      return originalDescriptor.get?.call(this);
    },
    set(value) {
      if (value === "blob") {
        console.log("Intercepted blob!");
        originalDescriptor.set?.call(this, "arraybuffer");
        return;
      }
      originalDescriptor.set?.call(this, value);
    },
    enumerable: originalDescriptor.enumerable,
    configurable: originalDescriptor.configurable,
  });
}

const ws = new WS("wss://echo.websocket.org");
ws.binaryType = "blob";
console.log("Current binaryType:", ws.binaryType);
process.exit(0);
