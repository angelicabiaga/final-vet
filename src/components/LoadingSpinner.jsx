import React from "react";

export default function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div style={{ minHeight: "35vh", display: "grid", placeItems: "center", color: "#4DA8DA" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 42, height: 42, border: "4px solid #dff2fa", borderTopColor: "#4DA8DA", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 12px" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span>{label}</span>
      </div>
    </div>
  );
}
