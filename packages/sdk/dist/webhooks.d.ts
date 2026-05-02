export type VerifyWebhookSignatureInput = {
    secret: string;
    payload: string | Buffer;
    timestamp: string | string[] | undefined;
    signature: string | string[] | undefined;
    toleranceSeconds?: number;
};
export declare function verifyWebhookSignature({ secret, payload, timestamp, signature, toleranceSeconds }: VerifyWebhookSignatureInput): Promise<boolean>;
