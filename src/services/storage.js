const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');
const logger = require('../utils/logger');

const s3 = new S3Client({ region: config.s3.region, credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey } });

async function uploadBuffer(buffer, key, contentType='audio/mpeg'){
  if(!config.s3.bucket) throw new Error('S3 bucket not configured');
  const params = {
    Bucket: config.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read'
  };
  await s3.send(new PutObjectCommand(params));
  // Construct public URL (works for AWS S3)
  const url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${encodeURIComponent(key)}`;
  logger.log('Uploaded to S3', url);
  return url;
}

module.exports = { uploadBuffer };
