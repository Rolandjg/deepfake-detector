import React from 'react'

const Nav = () => {
  return (
    <div>
      {/* Changed bg-white to bg-slate-900 for the dark theme container */}
      <div className="w-full py-3 px-4 bg-slate-900 flex">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 590 150" className="h-12 sm:h-14 md:h-18 w-auto">
            <g strokeLinecap="round" strokeLinejoin="round">
                {/* Darkened the background wireframe image so it sits back visually */}
                <rect x="35" y="35" width="60" height="60" rx="8" fill="none" stroke="#334155" strokeWidth="5" />
                <circle cx="75" cy="53" r="6" fill="#334155" />
                <path d="M 38 92 L 55 70 L 67 83 L 77 73 L 92 92" fill="none" stroke="#334155" strokeWidth="5" />
            </g>

            <g>
                {/* Magnifying glass background changed to match the nav background */}
                <circle cx="95" cy="90" r="32" fill="#0F172A" />

                {/* Cyan accents stay the same - they look great on dark backgrounds */}
                <path d="M 95 70 Q 95 90 115 90 Q 95 90 95 110 Q 95 90 75 90 Q 95 90 95 70 Z" fill="#06B6D4" opacity="0.2" />
                <path d="M 95 76 Q 95 90 109 90 Q 95 90 95 104 Q 95 90 81 90 Q 95 90 95 76 Z" fill="#06B6D4" />

                {/* Outlines and handle changed from very dark indigo to a crisp off-white */}
                <circle cx="95" cy="90" r="32" fill="none" stroke="#F8FAFC" strokeWidth="8" />

                <line x1="117" y1="112" x2="143" y2="138" stroke="#F8FAFC" strokeWidth="12" strokeLinecap="round" />
                <line x1="122" y1="117" x2="138" y2="133" stroke="#06B6D4" strokeWidth="3" strokeLinecap="round" />
            </g>

            <text x="175" y="95" fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif" fontSize="44">
                {/* "Deep" changed to off-white, "Analyzer" lightened to stand out */}
                <tspan fontWeight="900" fill="#F8FAFC">Deep</tspan>
                <tspan fontWeight="900" fill="#06B6D4">Fake</tspan>
                <tspan fontWeight="300" fill="#94A3B8"> Analyzer</tspan>
            </text>
        </svg>
      </div>
    </div>
  )
}

export default Nav