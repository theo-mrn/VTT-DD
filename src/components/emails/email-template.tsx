import * as React from 'react';
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Hr,
    Img,
} from '@react-email/components';

interface EmailTemplateProps {
    firstName: string;
    campaignName?: string;
    schedulingUrl?: string;
}

export const EmailTemplate = ({
    firstName,
    campaignName = 'votre campagne',
}: EmailTemplateProps) => (
    <Html>
        <Head />
        <Preview>Le silence a duré trop longtemps... {campaignName} vous rappelle.</Preview>
        <Body style={main}>
            <Container style={container}>
                <Heading style={h1}>🕯️ L'aventure n'est pas finie...</Heading>
                <Text style={text}>Salutations, {firstName},</Text>
                <Text style={text}>
                    Les contrées de <strong>{campaignName}</strong> sont bien calmes ces derniers temps. Trop calmes.
                </Text>
                <Text style={text}>
                    Vos compagnons s'impatientent et le destin du monde est en suspens. Il serait grand temps de dépoussiérer vos dés et de reprendre la route.
                </Text>
                <Section style={section}>
                    <Text style={text}>
                        Seriez-vous prêt à repartir à l'aventure ?
                    </Text>
                    <Button style={button} href="https://yner.fr">
                        ✋ Je suis prêt à reprendre !
                    </Button>
                    <Text style={note}>
                        Répondez à ce message pour organiser les retrouvailles.
                    </Text>
                </Section>
                <Hr style={hr} />
                <Text style={footer}>
                    L'histoire attend que vous l'écriviez.
                </Text>
            </Container>
        </Body>
    </Html>
);

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '30px 0',
    padding: '0',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '26px',
    textAlign: 'left' as const,
    padding: '0 20px',
};

const section = {
    padding: '24px',
    textAlign: 'center' as const,
};

const button = {
    backgroundColor: '#5F51E8',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    width: '100%',
    padding: '12px',
};

const note = {
    color: '#666',
    fontSize: '14px',
    fontStyle: 'italic',
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '20px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
    textAlign: 'center' as const,
};