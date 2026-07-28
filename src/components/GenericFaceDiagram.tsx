import React from 'react';

// Diagrama de rosto genérico — gerado pelo Gemini (Google), imagem de propriedade do
// usuário conforme os termos do Google (não reivindicam direitos sobre o conteúdo gerado,
// uso comercial permitido). Usado só como referência visual pra marcar pontos de aplicação.
export default function GenericFaceDiagram({ sex }: { sex: 'F' | 'M' }) {
  const src = sex === 'F' ? '/diagrams/face-female.jpg' : '/diagrams/face-male.jpg';
  return (
    <img
      src={src}
      alt={sex === 'F' ? 'Diagrama de rosto feminino' : 'Diagrama de rosto masculino'}
      className="w-full h-full object-cover select-none"
      style={{ touchAction: 'none' }}
      draggable={false}
    />
  );
}
