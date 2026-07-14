import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'jsx-email'

const main = {
  backgroundColor: '#fcfdff',
  color: '#0d1014',
  fontFamily:
    'Geist Variable, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  margin: 0,
  padding: '32px 0',
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e0e3e7',
  borderRadius: '9px',
  padding: '32px',
}

const brand = {
  color: '#0d1014',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: '20px',
  margin: '10px 0 0',
  textAlign: 'center' as const,
}

const logo = {
  display: 'block',
  margin: '0 auto',
}

const heading = {
  color: '#0d1014',
  fontSize: '24px',
  lineHeight: '32px',
  margin: '24px 0 12px',
}

const text = {
  color: '#0d1014',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const mutedText = {
  color: '#646d78',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '16px 0 0',
}

const link = {
  color: '#0069c6',
  textDecoration: 'underline',
}

type ResetPasswordEmailProps = {
  resetUrl: string
  userName?: string | null
}

export const previewProps = {
  resetUrl: 'https://metricsdock.com/reset-password?token=preview',
  userName: 'Taylor',
} satisfies ResetPasswordEmailProps

export function Template(props: Partial<ResetPasswordEmailProps>) {
  return <ResetPasswordEmail {...previewProps} {...props} />
}

export function ResetPasswordEmail({
  resetUrl,
  userName,
}: ResetPasswordEmailProps) {
  const trimmedName = userName?.trim()
  const logoUrl = new URL('/logo.png', resetUrl).href

  return (
    <Html>
      <Head />
      <Preview>Reset your MetricsDock password</Preview>
      <Body style={main}>
        <Container containerWidth={560} style={container}>
          <Section>
            <Img
              alt="MetricsDock"
              height="42"
              src={logoUrl}
              style={logo}
              width="36"
            />
            <Text style={brand}>MetricsDock</Text>
          </Section>
          <Heading as="h1" style={heading}>
            Reset your password
          </Heading>
          <Text style={text}>{trimmedName ? `Hi ${trimmedName},` : 'Hi,'}</Text>
          <Text style={text}>
            We received a request to reset your MetricsDock password. Use this
            link to choose a new password.
          </Text>
          <Button
            align="center"
            backgroundColor="#0069c6"
            borderRadius={9}
            fontSize={15}
            height={44}
            href={resetUrl}
            textColor="#f4fbff"
            width={190}
          >
            Reset password
          </Button>
          <Text style={mutedText}>
            This link expires in 1 hour. If you did not request a password
            reset, you can ignore this email.
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Text style={mutedText}>
            Button not working? Open this link:{' '}
            <a href={resetUrl} style={link}>
              {resetUrl}
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
