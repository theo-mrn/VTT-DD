import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface InvoiceEmailProps {
    username?: string;
    invoiceNumber?: string;
    amount?: string;
    description?: string;
    invoiceUrl?: string;
    pdfUrl?: string;
}

export const InvoiceEmail = ({
    username,
    invoiceNumber,
    amount,
    description,
    invoiceUrl,
    pdfUrl,
}: InvoiceEmailProps) => (
    <Html>
        <Head />
        <Preview>{`Votre facture VTT-DD #${invoiceNumber || ''}`}</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>FACTURE</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={icon}>🧾</Text>
                    </Section>

                    <Heading style={welcomeHeading}>
                        PAIEMENT CONFIRMÉ
                    </Heading>

                    <Text style={introText}>
                        Bonjour {username || 'Aventurier'},
                    </Text>

                    <Text style={descriptionText}>
                        Votre paiement a été traité avec succès. Voici le récapitulatif :
                    </Text>

                    <Section style={detailsBox}>
                        {invoiceNumber && (
                            <Text style={detailRow}>
                                <span style={detailLabel}>Facture :</span> #{invoiceNumber}
                            </Text>
                        )}
                        {description && (
                            <Text style={detailRow}>
                                <span style={detailLabel}>Description :</span> {description}
                            </Text>
                        )}
                        {amount && (
                            <Text style={detailRowAmount}>
                                <span style={detailLabel}>Montant :</span> {amount}
                            </Text>
                        )}
                    </Section>

                    <Section style={buttonSection}>
                        {invoiceUrl && (
                            <Link href={invoiceUrl} style={primaryButton}>
                                Voir la facture en ligne
                            </Link>
                        )}
                        {pdfUrl && (
                            <Link href={pdfUrl} style={secondaryButton}>
                                Télécharger le PDF
                            </Link>
                        )}
                    </Section>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Cette facture est générée automatiquement. Conservez-la pour vos dossiers.
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Yner VTT-DD.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default InvoiceEmail;

const colors = {
    background: '#1c1c1c',
    card: '#2a2a2a',
    border: '#3a3a3a',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    accent: '#ce9c56',
    success: '#10b981',
};

const main = {
    backgroundColor: colors.background,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
    color: colors.textPrimary,
};

const container = {
    margin: '0 auto',
    padding: '40px 20px',
    maxWidth: '580px',
};

const header = {
    marginBottom: '32px',
    textAlign: 'center' as const,
};

const headerTitle = {
    color: colors.accent,
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '4px',
    margin: '0',
    textTransform: 'uppercase' as const,
};

const card = {
    backgroundColor: colors.card,
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    textAlign: 'center' as const,
};

const iconSection = {
    marginBottom: '24px',
};

const icon = {
    fontSize: '64px',
    margin: '0',
    lineHeight: '1',
};

const welcomeHeading = {
    color: colors.success,
    fontSize: '24px',
    fontWeight: '800',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    margin: '0 0 16px',
};

const introText = {
    fontSize: '18px',
    color: colors.textSecondary,
    margin: '0 0 16px',
    lineHeight: '26px',
};

const descriptionText = {
    color: colors.textPrimary,
    fontSize: '16px',
    lineHeight: '24px',
    marginBottom: '24px',
};

const detailsBox = {
    backgroundColor: '#1c1c1c',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    padding: '20px',
    marginBottom: '24px',
    textAlign: 'left' as const,
};

const detailRow = {
    color: colors.textPrimary,
    fontSize: '14px',
    margin: '0 0 8px',
    lineHeight: '20px',
};

const detailRowAmount = {
    color: colors.accent,
    fontSize: '18px',
    fontWeight: '700',
    margin: '8px 0 0',
    lineHeight: '24px',
};

const detailLabel = {
    color: colors.textSecondary,
    fontWeight: '600' as const,
};

const buttonSection = {
    marginBottom: '24px',
};

const primaryButton = {
    backgroundColor: colors.accent,
    color: '#1c1c1c',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '700',
    textDecoration: 'none',
    display: 'inline-block' as const,
    marginRight: '12px',
    marginBottom: '8px',
};

const secondaryButton = {
    backgroundColor: 'transparent',
    color: colors.accent,
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    display: 'inline-block' as const,
    border: `1px solid ${colors.accent}`,
};

const divider = {
    borderColor: colors.border,
    margin: '32px 0',
};

const footerText = {
    color: colors.textSecondary,
    fontSize: '13px',
    margin: '0',
};

const footerCopyright = {
    color: '#525252',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '32px',
};
