export type VerifyWebhookSignatureInput = {
    secret: string;
    payload: string | Buffer;
    timestamp: string | string[] | undefined;
    signature: string | string[] | undefined;
    toleranceSeconds?: number;
    /**
     * Optional signing pepper that matches BEHALFID_WEBHOOK_SIGNING_PEPPER on the
     * server. When set, the effective HMAC key is HMAC-SHA256(pepper, SHA256(secret))
     * rather than SHA256(secret) alone. Configure this if the server has the pepper
     * environment variable set.
     */
    signingPepper?: string;
};
export declare function verifyWebhookSignature({ secret, payload, timestamp, signature, toleranceSeconds, signingPepper }: VerifyWebhookSignatureInput): Promise<boolean>;
