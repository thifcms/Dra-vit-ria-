// Comprime/redimensiona uma foto antes de subir pro Storage — a maioria das fotos de
// celular vem em 3-10MB, muito mais do que precisa pra visualização clínica de
// antes/depois. Redimensiona pro maior lado não passar de MAX_DIMENSION e reexporta como
// JPEG com qualidade reduzida, o que costuma cortar 80-95% do tamanho do arquivo sem
// prejudicar visivelmente a qualidade pra esse uso.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  // Não mexe em formatos que já são leves/vetoriais, ou se não for imagem de verdade
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width > height) {
        height = Math.round((height / width) * MAX_DIMENSION);
        width = MAX_DIMENSION;
      } else {
        width = Math.round((width / height) * MAX_DIMENSION);
        height = MAX_DIMENSION;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return file;

    // Se por algum motivo a versão comprimida ficou MAIOR que a original (raro, mas pode
    // acontecer com imagens já bem comprimidas), mantém a original em vez de piorar
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // Se a compressão falhar por qualquer motivo, sobe o arquivo original em vez de travar
    return file;
  }
}
