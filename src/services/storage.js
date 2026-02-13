const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize S3Client with endpoint for Cloudflare R2 (or standard AWS)
const clientConfig = {
  region: config.s3.region || 'auto',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey
  }
};

// If endpoint is provided (Cloudflare R2 or compatible), add it
if (config.s3.endpoint) {
  clientConfig.endpoint = config.s3.endpoint;
}

const s3 = new S3Client(clientConfig);

async function uploadBuffer(buffer, key, contentType='audio/mpeg'){
  if(!config.s3.bucket) throw new Error('S3 bucket not configured');
  
  const params = {
    Bucket: config.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
    // Note: ACL 'public-read' may not be supported by all S3-compatible services
    // Cloudflare R2 ignores ACL, but we keep it for compatibility
  };
  
  try {
    await s3.send(new PutObjectCommand(params));
    logger.log('Uploaded to S3/R2', key);
  } catch (err) {
    logger.error('S3 upload failed', err.message || err);
    throw err;
  }

  // Construct public URL based on endpoint or AWS region
  let url;
  if (config.s3.endpoint) {
    // For Cloudflare R2 or S3-compatible endpoint
    // Remove trailing slash if present and construct full URL
    const baseUrl = config.s3.endpoint.replace(/\/$/, '');
    url = `${baseUrl}/${encodeURIComponent(key)}`;
  } else {
    // Standard AWS S3 URL format
    url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${encodeURIComponent(key)}`;
  }
  
  logger.log('S3 URL:', url);
  return url;
}

module.exports = { uploadBuffer };
