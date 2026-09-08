import crypto from "node:crypto";
import * as Minio from "minio";

const endpointUrl = new URL(
  process.env.MINIO_ENDPOINT ||
    process.env.MINIO_SERVER_URL ||
    "http://127.0.0.1:9000",
);

const client = new Minio.Client({
  endPoint: endpointUrl.hostname,
  port: endpointUrl.port
    ? Number(endpointUrl.port)
    : endpointUrl.protocol === "https:"
      ? 443
      : 80,
  useSSL: endpointUrl.protocol === "https:",
  accessKey: process.env.MINIO_ROOT_USER || "",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "",
  region: process.env.MINIO_REGION_NAME || "us-east-1",
});

export const TRANSACTION_PROOF_BUCKET = (
  process.env.MINIO_TRANSACTION_BUCKET_NAME || "transaction-proof"
).toLowerCase();
export const QR_PAYMENT_BUCKET = (
  process.env.MINIO_QR_PAYMENT_BUCKET_NAME || "qr-image"
).toLowerCase();

const ensuredBuckets = new Set();

async function ensureBucket(bucket) {
  if (ensuredBuckets.has(bucket)) return;
  if (!(await client.bucketExists(bucket))) {
    await client.makeBucket(
      bucket,
      process.env.MINIO_REGION_NAME || "us-east-1",
    );
  }
  ensuredBuckets.add(bucket);
}

function extensionFor(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function uploadImage({ bucket, buffer, contentType, prefix }) {
  await ensureBucket(bucket);
  const objectName = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  await client.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
    "Cache-Control": bucket === QR_PAYMENT_BUCKET ? "public, max-age=86400" : "private, no-store",
  });
  return objectName;
}

export async function getPrivateImageUrl(bucket, objectName, expirySeconds = 900) {
  if (!objectName) return "";
  await ensureBucket(bucket);
  return client.presignedGetObject(bucket, objectName, expirySeconds);
}

export async function getImageObject(bucket, objectName) {
  await ensureBucket(bucket);
  const [stream, stat] = await Promise.all([
    client.getObject(bucket, objectName),
    client.statObject(bucket, objectName),
  ]);
  return { stream, stat };
}
