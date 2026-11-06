import { supabase, STORAGE_BUCKET } from "../config.js";
import fs from "node:fs/promises";
import path from "node:path";

export interface UploadAttachmentOptions {
  txId: string;
  type: "invoice" | "receipt";
  fileInput: string; // Caminho local de arquivo, Base64 (data: ou puro), ou URL HTTP
  fileName?: string;
}

export async function uploadTransactionAttachment(
  options: UploadAttachmentOptions
): Promise<string> {
  const { txId, type, fileInput, fileName } = options;

  // Se já for uma URL HTTP/HTTPS externa ou pública, retorna ela mesma
  if (fileInput.startsWith("http://") || fileInput.startsWith("https://")) {
    return fileInput;
  }

  let buffer: Buffer;
  let ext = "pdf";
  let contentType = "application/pdf";

  if (fileInput.startsWith("data:")) {
    // Formato DataURL: data:application/pdf;base64,...
    const matches = fileInput.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Formato Base64 DataURL inválido.");
    }
    contentType = matches[1];
    buffer = Buffer.from(matches[2], "base64");
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("pdf")) ext = "pdf";
  } else if (fileInput.length > 500 && !fileInput.includes("\n") && !fileInput.includes("/") && !fileInput.includes("\\")) {
    // Parece Base64 puro
    buffer = Buffer.from(fileInput, "base64");
    if (fileName) {
      ext = path.extname(fileName).replace(".", "") || "pdf";
    }
  } else {
    // Supõe ser caminho de arquivo no sistema operacional
    try {
      buffer = await fs.readFile(fileInput);
      ext = path.extname(fileInput).replace(".", "") || "pdf";
      if (ext === "pdf") contentType = "application/pdf";
      else if (ext === "png") contentType = "image/png";
      else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    } catch (err: any) {
      throw new Error(`Não foi possível ler o arquivo no caminho "${fileInput}": ${err.message}`);
    }
  }

  const timestamp = Date.now();
  const filePath = `${txId}/${type}_${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Erro ao fazer upload no bucket "${STORAGE_BUCKET}": ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
