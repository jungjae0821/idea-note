declare namespace Cloudflare {
  interface Env {
    DEPLOY_POD?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
