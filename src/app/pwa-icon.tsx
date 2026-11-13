import { ImageResponse } from "next/og";

// F6-03: mismo símbolo que `icon.svg` (fondo #131313, tres barras #c0ceff),
// generado como PNG para los instaladores que no aceptan SVG. `maskable`
// llena todo el lienzo y mantiene el símbolo dentro de la zona segura (80 %).
export function pwaIcon(size: number, maskable: boolean) {
  const symbol = Math.round(size * (maskable ? 0.55 : 0.7));
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#131313",
        borderRadius: maskable ? 0 : Math.round(size / 4),
      }}
    >
      <svg width={symbol} height={symbol} viewBox="5 5 22 22">
        <path
          d="M8 22V17M16 22V10M24 22V14"
          stroke="#c0ceff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
