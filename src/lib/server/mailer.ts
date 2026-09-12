import nodemailer from "nodemailer";

export const createMailTransporter = () => {
  return nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

export const MAIL_FROM = () => `"Campus Connect" <${process.env.EMAIL_USERNAME}>`;

/** Verify + send in one call (legacy behavior: fresh transporter per send). */
export const sendMail = async (options: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ messageId: string }> => {
  const transporter = createMailTransporter();
  await transporter.verify();
  const info = await transporter.sendMail({
    from: MAIL_FROM(),
    ...options,
  });
  return { messageId: info.messageId };
};
