export const STUDY_LESSONS = [
  {
    id: "phishing",
    number: "01",
    title: "Phishing & suspicious links",
    boardTitle: "PAUSE BEFORE YOU CLICK",
    boardIntro:
      "Phishing is when someone pretends to be a trusted person or organisation to trick you into opening a link or sharing private information.",
    keyPoints: [
      "Check the sender address and website domain carefully.",
      "Be cautious of urgent threats, prizes or unexpected account warnings.",
      "Do not open unexpected links or attachments just because a message looks official.",
      "Verify through the organisation's official app, website or known phone number.",
    ],
    storyTitle: "The account-warning message",
    storyIntro:
      "Alex received a message claiming to be from PhishVille Bank. It says the account will be locked unless Alex verifies details through a shortened link. Help Alex check the warning and report it safely.",
    landmarks: [
      { name: "CYBER ACADEMY", tile: { x: 20, y: 35 } },
      { name: "COMMUNITY LIBRARY", tile: { x: 20, y: 20 } },
      { name: "PHISHVILLE BANK", tile: { x: 8, y: 35 } },
      { name: "CYBER CRIME CENTRE", tile: { x: 23, y: 29 } },
    ],
    steps: [
      {
        title: "Find Alex at the Community Library",
        place: "Community Library",
        npcName: "Alex",
        role: "Student",
        tile: { x: 20, y: 20 },
        tint: 0xffffff,
        dialogue:
          "I got a message saying my bank account will be locked today. The sender address looks strange, and the message wants me to use a shortened link. Is that safe?",
        response:
          "Those are warning signs: an unfamiliar sender, pressure to act quickly and an unexpected link. Do not click it. Let's verify the message separately with the bank.",
      },
      {
        title: "Verify the message at PhishVille Bank",
        place: "PhishVille Bank",
        npcName: "Priya",
        role: "Bank Adviser",
        tile: { x: 8, y: 35 },
        tint: 0xffe2c8,
        dialogue:
          "Welcome. Our bank never asks customers to sign in through a shortened link in an unexpected message. Use the official app or type the bank's known website address yourself.",
        response:
          "Good verification. A message can copy a logo and still be fake. Trust the official channel you reach yourself, not the link supplied in the suspicious message.",
      },
      {
        title: "Report the message at the Cyber Crime Centre",
        place: "Cyber Crime Centre",
        npcName: "Officer Dev",
        role: "Cyber Safety Officer",
        tile: { x: 23, y: 29 },
        tint: 0xddeeff,
        dialogue:
          "You did the right thing by not opening the link. Keep a screenshot and the sender details, block the sender, and report the suspicious message through an official reporting channel.",
        response:
          "Lesson complete: check the sender, question urgent requests, avoid unexpected links and verify independently before sharing information.",
      },
    ],
  },
  {
    id: "upi-otp",
    number: "02",
    title: "QR, UPI & OTP safety",
    boardTitle: "A PIN IS NOT FOR RECEIVING MONEY",
    boardIntro:
      "Payment scams often use fake refunds, QR codes or collect requests to trick people into authorising a payment or revealing a secret code.",
    keyPoints: [
      "A UPI PIN authorises a payment from your account; it is not needed to receive money.",
      "Read the amount and recipient name before approving any payment request.",
      "Do not share your UPI PIN, OTP or banking passwords with anyone.",
      "Treat unexpected refund links, QR codes and collect requests with caution.",
    ],
    storyTitle: "The surprise refund offer",
    storyIntro:
      "Mina at Market Café received a message promising a refund. It asks her to scan a QR code and approve a collect request. Help Mina understand what the request would do before she takes action.",
    landmarks: [
      { name: "CYBER ACADEMY", tile: { x: 20, y: 35 } },
      { name: "MARKET CAFÉ", tile: { x: 11, y: 19 } },
      { name: "PHISHVILLE BANK", tile: { x: 8, y: 35 } },
      { name: "CYBER CRIME CENTRE", tile: { x: 23, y: 29 } },
    ],
    steps: [
      {
        title: "Talk to Mina at Market Café",
        place: "Market Café",
        npcName: "Mina",
        role: "Café Owner",
        tile: { x: 11, y: 19 },
        tint: 0xffe7b0,
        dialogue:
          "A message says I have a refund waiting. It sent a QR code and says I must approve a collect request to get the money. Should I do it?",
        response:
          "Stop and check first. Scanning a QR code or approving a collect request can be part of making a payment. A refund should not require you to reveal your PIN or OTP.",
      },
      {
        title: "Check the request at PhishVille Bank",
        place: "PhishVille Bank",
        npcName: "Priya",
        role: "Bank Adviser",
        tile: { x: 8, y: 35 },
        tint: 0xffe2c8,
        dialogue:
          "A UPI PIN is used to authorise money leaving your account. Before approving anything, check the request type, recipient and amount. Never share your PIN or OTP with a caller or message sender.",
        response:
          "Exactly. Receiving money does not require you to enter your UPI PIN. Decline unexpected collect requests and confirm refunds through the merchant's official channel.",
      },
      {
        title: "Report the suspicious request at the Cyber Crime Centre",
        place: "Cyber Crime Centre",
        npcName: "Officer Dev",
        role: "Cyber Safety Officer",
        tile: { x: 23, y: 29 },
        tint: 0xddeeff,
        dialogue:
          "Do not approve the unexpected request or share a code. Keep the message details, contact your bank through its official channel if money is at risk, and report suspicious activity.",
        response:
          "Lesson complete: protect your PIN and OTP, read every payment request and never rely on a stranger's instructions to claim a refund.",
      },
    ],
  },
];
