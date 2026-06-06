import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Side-effect: importing this module triggers Pretendard variable font load.
loadFont({
  family: "Pretendard Variable",
  url: staticFile("fonts/PretendardVariable.woff2"),
  weight: "100 900",
  format: "woff2",
}).catch((err) => {
  console.error("Pretendard load failed", err);
});
