import { useEffect, useRef } from "react";
import lottie from "lottie-web";

export default function LottiePreview({ animationData }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !animationData) return;
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }
    animRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData,
    });
    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [animationData]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
