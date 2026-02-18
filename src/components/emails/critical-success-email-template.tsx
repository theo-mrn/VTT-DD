import {
    Body,
    Column,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Row,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface CriticalSuccessEmailTemplateProps {
    firstName: string;
    rollDetails?: string;
    campaignName?: string;
}

const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : '';

export const CriticalSuccessEmailTemplate = ({
    firstName,
    rollDetails = '1d20 → 20',
    campaignName = 'votre campagne',
}: CriticalSuccessEmailTemplateProps) => (
    <Html>
        <Head />
        <Preview>🏆 Succès critique ! {firstName} a fait un 20 naturel !</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>DICE DISASTER</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={trophyIcon}>🏆</Text>
                    </Section>

                    <Heading style={successHeading}>SUCCÈS CRITIQUE</Heading>

                    <Text style={introText}>
                        Les étoiles s'alignent pour vous, <strong>{firstName}</strong>.
                    </Text>

                    <Section style={rollContainer}>
                        <Row>
                            <Column align="center">
                                <Text style={rollLabel}>RÉSULTAT DU LANCER</Text>
                                <Text style={rollValue}>20</Text>
                                <Text style={rollDetailsText}>{rollDetails}</Text>
                            </Column>
                        </Row>
                    </Section>

                    <Section style={titleContainer}>
                        <Row>
                            <Column align="center">
                                <Text style={titleLabel}>NOUVEAU TITRE DÉBLOQUÉ</Text>
                                <Text style={titleValue}>Béni des Dieux</Text>
                            </Column>
                        </Row>
                    </Section>

                    <Text style={descriptionText}>
                        Un moment de pur génie (ou de chance insolente) vient de se produire dans <strong>{campaignName}</strong>.
                        Impossible n'est pas français, et clairement pas dans votre vocabulaire aujourd'hui.
                        Savourez cette victoire, elle est méritée.
                    </Text>

                    <Section style={quoteContainer}>
                        <Text style={quoteText}>
                            "La chance ne sourit pas aux audacieux, elle s'incline devant eux."
                        </Text>
                    </Section>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Continuez sur cette lancée, héros. Rien ne semble pouvoir vous arrêter.
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Dice Disaster via VTT-DD. Que vos 20 soient nombreux.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default CriticalSuccessEmailTemplate;

// Theme Colors from globals.css & tailwind.config.ts
const colors = {
    background: '#1c1c1c',     // --bg-dark
    card: '#2a2a2a',           // --bg-card
    border: '#3a3a3a',         // --border-color
    textPrimary: '#d4d4d4',    // --text-primary
    textSecondary: '#a0a0a0',  // --text-secondary
    accent: '#c0a080',         // --accent-brown
    success: '#10b981',        // Success Green/Emerald
    gold: '#fbbf24',           // Gold for text gradient
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
    boxShadow: `0 4px 20px ${colors.success}33`, // Green glow (approx 20% opacity)
    textAlign: 'center' as const,
};

const iconSection = {
    marginBottom: '24px',
};

const trophyIcon = {
    fontSize: '64px',
    margin: '0',
    lineHeight: '1',
};

const successHeading = {
    color: colors.success,
    fontSize: '32px',
    fontWeight: '800',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    margin: '0 0 16px',
};

const introText = {
    fontSize: '18px',
    color: colors.textSecondary,
    margin: '0 0 32px',
    lineHeight: '26px',
};

const rollContainer = {
    backgroundColor: colors.background,
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '32px',
    border: `1px solid ${colors.border}`,
    boxShadow: `inset 0 0 20px ${colors.success}1A`, // Subtle inner green glow
};

const rollLabel = {
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 8px',
};

const rollValue = {
    color: '#ffffff',
    fontSize: '48px',
    fontWeight: '900',
    margin: '0',
    lineHeight: '1',
    textShadow: `0 2px 10px ${colors.success}80`, // Stronger green glow
};

const rollDetailsText = {
    color: colors.textSecondary,
    fontSize: '14px',
    margin: '8px 0 0',
    fontFamily: 'monospace',
};

const descriptionText = {
    color: colors.textPrimary,
    fontSize: '16px',
    lineHeight: '24px',
    marginBottom: '32px',
};

const quoteContainer = {
    borderLeft: `4px solid ${colors.success}`,
    backgroundColor: `${colors.success}1A`, // 10% opacity
    padding: '16px 24px',
    borderRadius: '0 8px 8px 0',
    marginBottom: '32px',
    textAlign: 'left' as const,
};

const quoteText = {
    color: colors.textPrimary,
    fontSize: '16px',
    fontStyle: 'italic',
    margin: '0',
    lineHeight: '24px',
};

const divider = {
    borderColor: colors.border,
    margin: '32px 0',
};

const footerText = {
    color: colors.textSecondary,
    fontSize: '14px',
    margin: '0',
};

const footerCopyright = {
    color: '#525252',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '32px',
};

const titleContainer = {
    backgroundColor: `${colors.success}1A`, // 10% opacity
    border: `1px solid ${colors.success}`,
    borderRadius: '8px',
    padding: '16px',
    marginTop: '24px',
    marginBottom: '24px',
};

const titleLabel = {
    color: colors.textSecondary,
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 4px',
};

const titleValue = {
    color: colors.success,
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0',
    letterSpacing: '0.5px',
};
