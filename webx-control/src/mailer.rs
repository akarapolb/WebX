//! Sending the outbox's mail (docs/target-architecture.md, track C5, decision D15). SMTP through the lettre crate, with
//! rustls for TLS, configured by one URL so a deployment can name its mail server the way Strapi's nodemailer was set up:
//!
//!   WEBX_SMTP_URL   smtps://user:pass@smtp.example.go.th:465        TLS from the first byte
//!                   smtp://user:pass@smtp.example.go.th:587?tls=required   STARTTLS, refusing to send without it
//!                   smtp://relay.internal:25                         plain, for a relay on the internal network
//!   WEBX_MAIL_FROM  "สพร. <no-reply@dga.or.th>"                      the sender (default no-reply@localhost)
//!
//! With no WEBX_SMTP_URL mail is still queued (outbox.rs) and kept until a server is configured.
use lettre::{message::header::ContentType, message::Mailbox, transport::smtp::SmtpTransport, Message, Transport};

pub struct Mailer {
    transport: SmtpTransport,
    from: Mailbox,
}

impl Mailer {
    /// From WEBX_SMTP_URL and WEBX_MAIL_FROM; None when no server is configured, an error when either is malformed.
    pub fn from_env() -> Result<Option<Mailer>, String> {
        let Some(url) = std::env::var("WEBX_SMTP_URL").ok().filter(|u| !u.trim().is_empty()) else { return Ok(None) };
        let from = std::env::var("WEBX_MAIL_FROM").ok().filter(|f| !f.trim().is_empty()).unwrap_or_else(|| "no-reply@localhost".into());
        Mailer::new(&url, &from).map(Some)
    }

    pub fn new(url: &str, from: &str) -> Result<Mailer, String> {
        let transport = SmtpTransport::from_url(url).map_err(|e| format!("WEBX_SMTP_URL: {e}"))?.build();
        let from: Mailbox = from.parse().map_err(|e| format!("WEBX_MAIL_FROM: {e}"))?;
        Ok(Mailer { transport, from })
    }

    /// Send one plain-text mail. Blocking: run it off the async runtime.
    pub fn send(&self, to: &str, subject: &str, text: &str) -> Result<(), String> {
        let to: Mailbox = to.parse().map_err(|_| "the recipient is not an e-mail address".to_string())?;
        let msg = Message::builder().from(self.from.clone()).to(to).subject(subject).header(ContentType::TEXT_PLAIN).body(text.to_string()).map_err(|e| e.to_string())?;
        self.transport.send(&msg).map(|_| ()).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_server_url_and_a_sender_are_checked_up_front() {
        assert!(Mailer::new("smtp://relay.internal:25", "no-reply@dga.or.th").is_ok());
        assert!(Mailer::new("smtps://user:pass@smtp.example.go.th:465", "สพร. <no-reply@dga.or.th>").is_ok());
        assert!(Mailer::new("smtp://smtp.example.go.th:587?tls=required", "a@b.co").is_ok());
        assert!(Mailer::new("not a url", "a@b.co").err().unwrap().starts_with("WEBX_SMTP_URL"));
        assert!(Mailer::new("smtp://relay:25", "not an address").err().unwrap().starts_with("WEBX_MAIL_FROM"));
    }
}
