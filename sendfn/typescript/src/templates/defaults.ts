import { EmailTemplate } from '../types';

export const welcomeEmailTemplate: EmailTemplate = {
  id: "welcome-email",
  name: "Welcome Email",
  subject: "Welcome to {{appName}}, {{userName}}!",
  html: `
    <html>
      <body>
        <h1>Welcome, {{userName}}!</h1>
        <p>Thanks for joining {{appName}}.</p>
        {{#if verificationUrl}}
        <p><a href="{{verificationUrl}}">Verify your email</a></p>
        {{/if}}
      </body>
    </html>
  `,
  text: "Welcome, {{userName}}! Thanks for joining {{appName}}.{{#if verificationUrl}} Verify your email: {{verificationUrl}}{{/if}}",
  variables: ["appName", "userName"],
  metadata: {
    optionalVariables: ["verificationUrl"],
  },
};

export const passwordResetTemplate: EmailTemplate = {
  id: "password-reset",
  name: "Password Reset",
  subject: "Reset your password",
  html: `
    <html>
      <body>
        <h1>Reset Your Password</h1>
        <p>Click the link below to reset your password:</p>
        <p><a href="{{resetUrl}}">Reset Password</a></p>
        <p>This link expires in {{expiresIn}}.</p>
      </body>
    </html>
  `,
  text: "Reset your password: {{resetUrl}} (expires in {{expiresIn}})",
  variables: ["resetUrl", "expiresIn"],
};

export const notificationTemplate: EmailTemplate = {
  id: "notification",
  name: "Generic Notification",
  subject: "{{subject}}",
  html: `
    <html>
      <body>
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if ctaUrl}}
        <p><a href="{{ctaUrl}}">{{ctaText}}</a></p>
        {{/if}}
      </body>
    </html>
  `,
  text: "{{title}}\n\n{{message}}\n\n{{#if ctaUrl}}{{ctaText}}: {{ctaUrl}}{{/if}}",
  variables: ["subject", "title", "message"],
  metadata: {
    optionalVariables: ["ctaUrl", "ctaText"],
  },
};
