export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function downscaleImage(url: string, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

export function cropImage(imageSrc: string, area: CropArea): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const sx = img.naturalWidth / img.width;
      const sy = img.naturalHeight / img.height;
      canvas.width = Math.max(1, Math.round(area.width));
      canvas.height = Math.max(1, Math.round(area.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 canvas"));
        return;
      }
      ctx.drawImage(img, area.x * sx, area.y * sy, area.width * sx, area.height * sy, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageSrc;
  });
}
