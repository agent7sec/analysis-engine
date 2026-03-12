/**
 * Certificate Generator Lambda
 * Called by Step Functions after human approval.
 */

import PDFDocument from 'pdfkit';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getAnalysisById, updateAnalysisStatus } from '../repositories/analysis.repository.js';
import { createCertificate } from '../repositories/certificate.repository.js';

interface StepFunctionsInput {
    analysisId: string;
    tenantId: string;
    userId: string;
    resultSummary?: Record<string, unknown>;
}

interface StepFunctionsOutput {
    certificateId: string;
    s3Key: string;
    analysisId: string;
}

const s3 = new S3Client({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint, forcePathStyle: true } : {}),
});

export const handler = async (input: StepFunctionsInput): Promise<StepFunctionsOutput> => {
    const { analysisId, tenantId, userId, resultSummary } = input;
    logger.info('cert-generator.start', { analysisId, tenantId });

    const analysis = await getAnalysisById(userId, analysisId);
    if (!analysis) throw new Error(`Analysis ${analysisId} not found`);

    const pdfBuffer = await generateCertificatePdf({
        analysisId,
        fileName: analysis.fileName,
        tenantId,
        issuedAt: new Date(),
        resultSummary: resultSummary ?? {},
    });

    const s3Key = `${tenantId}/${analysisId}/certificate.pdf`;
    await s3.send(new PutObjectCommand({
        Bucket: config.s3.outputBucket,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        Metadata: { analysisId, tenantId, issuedAt: new Date().toISOString() },
    }));

    const certificate = await createCertificate({ analysisId, tenantId, s3Key, metadata: { resultSummary } });

    await updateAnalysisStatus(userId, analysisId, 'COMPLETED');

    logger.info('cert-generator.done', { analysisId, certificateId: certificate.certificateId, s3Key });
    return { certificateId: certificate.certificateId, s3Key, analysisId };
};

interface PdfOptions {
    analysisId: string; fileName: string; tenantId: string;
    issuedAt: Date; resultSummary: Record<string, unknown>;
}

function generateCertificatePdf(opts: PdfOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(24).font('Helvetica-Bold').text('Security Analysis Certificate', { align: 'center' });
        doc.moveDown(0.5).fontSize(12).font('Helvetica').fillColor('#666666')
            .text('Gen AI Platform — Automated SAST/SCA Certification', { align: 'center' });
        doc.moveDown(2);

        const line = (label: string, value: string) => {
            doc.font('Helvetica-Bold').fontSize(11).text(`${label}:`, { continued: true });
            doc.font('Helvetica').text(`  ${value}`);
            doc.moveDown(0.3);
        };
        line('Analysis ID', opts.analysisId);
        line('File', opts.fileName);
        line('Tenant', opts.tenantId);
        line('Issued At', opts.issuedAt.toUTCString());

        doc.moveDown(1.5).font('Helvetica-Bold').fontSize(13).fillColor('#000000').text('Analysis Summary');
        doc.moveDown(0.5).font('Courier').fontSize(9).fillColor('#333333')
            .text(JSON.stringify(opts.resultSummary, null, 2), { lineBreak: true });

        doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#999999')
            .text('This certificate was generated automatically and reviewed by a qualified security analyst.', { align: 'center' });
        doc.end();
    });
}
