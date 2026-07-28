import React from 'react';

// Diagrama de rosto genérico, desenhado do zero (SVG simples, sem base em nenhuma
// ilustração/atlas de terceiros) — serve só de referência visual pra marcar pontos de
// aplicação, no mesmo estilo de "ficha de aplicação" usado em clínicas de estética.
export default function GenericFaceDiagram({ sex }: { sex: 'F' | 'M' }) {
  const isFemale = sex === 'F';

  return (
    <svg viewBox="0 0 300 380" className="w-full h-full select-none" style={{ touchAction: 'none' }}>
      {/* Cabelo — atrás do rosto */}
      {isFemale ? (
        <path
          d="M 150 40 C 95 40 60 85 58 145 C 56 200 62 260 75 320 C 78 300 82 270 85 250 C 82 200 85 150 100 110 C 115 75 130 60 150 58 C 170 60 185 75 200 110 C 215 150 218 200 215 250 C 218 270 222 300 225 320 C 238 260 244 200 242 145 C 240 85 205 40 150 40 Z"
          fill="#F0E6DC"
          stroke="#D8CFC4"
          strokeWidth="1.5"
        />
      ) : (
        <path
          d="M 150 45 C 100 45 65 80 62 130 C 60 155 63 175 68 190 C 72 165 78 145 90 128 C 105 108 125 98 150 96 C 175 98 195 108 210 128 C 222 145 228 165 232 190 C 237 175 240 155 238 130 C 235 80 200 45 150 45 Z"
          fill="#EDE2D6"
          stroke="#D8CFC4"
          strokeWidth="1.5"
        />
      )}

      {/* Pescoço e ombros */}
      <path
        d="M 128 250 L 128 285 C 90 300 55 330 40 370 L 260 370 C 245 330 210 300 172 285 L 172 250 Z"
        fill="#FBEEE3"
        stroke="#E8D9C8"
        strokeWidth="1.5"
      />

      {/* Orelhas */}
      <ellipse cx="62" cy="185" rx="10" ry="18" fill="#FBEEE3" stroke="#E8D9C8" strokeWidth="1.5" />
      <ellipse cx="238" cy="185" rx="10" ry="18" fill="#FBEEE3" stroke="#E8D9C8" strokeWidth="1.5" />

      {/* Formato do rosto */}
      <path
        d={
          isFemale
            ? 'M 150 75 C 108 75 82 105 78 150 C 75 190 82 225 100 255 C 115 278 132 292 150 292 C 168 292 185 278 200 255 C 218 225 225 190 222 150 C 218 105 192 75 150 75 Z'
            : 'M 150 78 C 112 78 88 105 84 145 C 81 180 87 210 102 238 C 116 262 132 278 150 278 C 168 278 184 262 198 238 C 213 210 219 180 216 145 C 212 105 188 78 150 78 Z'
        }
        fill="#FBEEE3"
        stroke="#D8C4AE"
        strokeWidth="2"
      />

      {/* Sobrancelhas */}
      <path d="M 100 152 Q 118 142 136 150" fill="none" stroke="#B8A088" strokeWidth="4" strokeLinecap="round" />
      <path d="M 164 150 Q 182 142 200 152" fill="none" stroke="#B8A088" strokeWidth="4" strokeLinecap="round" />

      {/* Olhos */}
      <path d="M 104 170 Q 118 162 132 170 Q 118 178 104 170 Z" fill="#FDFBF9" stroke="#8A7A6C" strokeWidth="1.5" />
      <circle cx="118" cy="170" r="4.5" fill="#8A7A6C" />
      <path d="M 168 170 Q 182 162 196 170 Q 182 178 168 170 Z" fill="#FDFBF9" stroke="#8A7A6C" strokeWidth="1.5" />
      <circle cx="182" cy="170" r="4.5" fill="#8A7A6C" />

      {/* Nariz */}
      <path d="M 148 178 C 146 195 143 208 138 216 Q 150 222 162 216 C 157 208 154 195 152 178" fill="none" stroke="#C9B49E" strokeWidth="2" strokeLinecap="round" />

      {/* Boca */}
      <path
        d={isFemale ? 'M 128 240 Q 150 248 172 240' : 'M 130 238 Q 150 244 170 238'}
        fill="none"
        stroke="#B8846E"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Queixo/mandíbula — leve sombreado de referência (sutil, não é textura de pele) */}
      <path
        d={
          isFemale
            ? 'M 100 255 C 115 278 132 292 150 292 C 168 292 185 278 200 255'
            : 'M 102 238 C 116 262 132 278 150 278 C 168 278 184 262 198 238'
        }
        fill="none"
        stroke="#E8D9C8"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}
