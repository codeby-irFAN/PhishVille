import Phaser from "phaser";
import { STUDY_LESSONS } from "../data/studyLessons";

const FRAME_SIZE = 460;
const CHARACTER_SCALE = 0.11;

export default class ClassroomScene extends Phaser.Scene {
  constructor() {
    super("ClassroomScene");
    this.lesson = null;
    this.completedConcepts = [];
  }

  preload() {
    if (!this.textures.exists("phishville_character_idle")) {
      this.load.spritesheet(
        "phishville_character_idle",
        "/assets/characters/Character0/Character0_Idle.png",
        { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE }
      );
    }
    if (!this.textures.exists("phishville_character_walk")) {
      this.load.spritesheet(
        "phishville_character_walk",
        "/assets/characters/Character0/Character0_Walk.png",
        { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE }
      );
    }
  }

  create() {
    this.completedConcepts = this.registry.get("studyCompletedConcepts") || [];
    this.lesson = STUDY_LESSONS.find(
      (lesson) => !this.completedConcepts.includes(lesson.id)
    ) || null;

    this.cameras.main.setBackgroundColor("#d6e4d9");
    this.drawRoom();
    this.drawBoard();
    this.drawClassroomCharacters();
    this.drawProgressRail();

  }

  drawRoom() {
    const g = this.add.graphics();
    g.fillStyle(0xe9e2d0, 1).fillRect(0, 0, 1000, 650);
    g.fillStyle(0xd5c9ac, 1).fillRect(0, 470, 1000, 180);
    g.fillStyle(0x9d8e71, 1).fillRect(0, 462, 1000, 10);

    // Classroom floor tiles.
    g.lineStyle(1, 0xa99c82, 0.34);
    for (let x = 0; x <= 1000; x += 64) g.lineBetween(x, 472, x - 70, 650);
    for (let y = 500; y <= 650; y += 36) g.lineBetween(0, y, 1000, y);

    // Wall trim and windows.
    g.fillStyle(0x637e67, 1).fillRect(0, 0, 1000, 16);
    g.fillStyle(0xf8f2df, 1).fillRoundedRect(30, 50, 150, 190, 12);
    g.fillStyle(0x9ec6cb, 1).fillRect(43, 64, 124, 160);
    g.lineStyle(7, 0x637e67, 1).strokeRect(43, 64, 124, 160);
    g.lineBetween(105, 64, 105, 224);
    g.lineBetween(43, 144, 167, 144);
    g.fillStyle(0xf8f2df, 1).fillRoundedRect(815, 50, 150, 190, 12);
    g.fillStyle(0x9ec6cb, 1).fillRect(828, 64, 124, 160);
    g.lineStyle(7, 0x637e67, 1).strokeRect(828, 64, 124, 160);
    g.lineBetween(890, 64, 890, 224);
    g.lineBetween(828, 144, 952, 144);

    // Simple trees visible through the windows.
    g.fillStyle(0x6b9569, 0.85);
    [[70, 112], [145, 178], [855, 120], [930, 180]].forEach(([x, y]) => {
      g.fillCircle(x, y, 23);
      g.fillCircle(x + 16, y + 10, 17);
    });

    // Desks and chairs along the bottom of the room.
    for (const x of [300, 480, 660]) {
      g.fillStyle(0x806348, 1).fillRoundedRect(x, 500, 125, 22, 5);
      g.fillStyle(0xb68d5e, 1).fillRoundedRect(x + 6, 490, 113, 14, 4);
      g.fillStyle(0x536c5b, 1).fillRoundedRect(x + 35, 523, 54, 32, 5);
      g.fillStyle(0x6a4f39, 1).fillRect(x + 17, 522, 8, 26);
      g.fillStyle(0x6a4f39, 1).fillRect(x + 101, 522, 8, 26);
    }

    this.add.text(500, 25, "PHISHVILLE  •  CYBER ACADEMY", {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#294b38",
      letterSpacing: 2,
    }).setOrigin(0.5);
  }

  drawBoard() {
    const g = this.add.graphics();
    // City-style noticeboard / classroom chalkboard.
    g.fillStyle(0x765337, 1).fillRoundedRect(215, 72, 570, 382, 18);
    g.fillStyle(0x3d5d47, 1).fillRoundedRect(230, 86, 540, 350, 10);
    g.fillStyle(0xd1b17a, 1).fillRoundedRect(245, 100, 510, 322, 6);
    g.fillStyle(0x264936, 1).fillRoundedRect(253, 108, 494, 306, 4);
    g.fillStyle(0xead6a9, 1).fillRoundedRect(252, 427, 496, 15, 5);

    const currentNumber = this.lesson ? Number(this.lesson.number) : 2;
    this.add.text(270, 126, "TODAY'S CYBER-SAFETY LESSON", {
      fontFamily: "Arial, sans-serif", fontSize: "13px", fontStyle: "bold",
      color: "#e7c77f", letterSpacing: 1,
    });

    if (!this.lesson) {
      this.add.text(270, 160, "YOU COMPLETED BOTH CONCEPTS!", {
        fontFamily: "Arial, sans-serif", fontSize: "25px", fontStyle: "bold",
        color: "#fff0c8", wordWrap: { width: 440 },
      });
      this.add.text(270, 218,
        "Great work, Cyber Cadet. You practised spotting suspicious links and recognising unsafe payment requests.\n\nYou can replay the lessons whenever you want.",
        { fontFamily: "Arial, sans-serif", fontSize: "17px", color: "#f5f0de", lineSpacing: 10, wordWrap: { width: 440 } }
      );
      this.createButton(500, 365, 230, 46, "REPLAY BOTH LESSONS", () => {
        this.registry.set("studyCompletedConcepts", []);
        this.scene.restart();
      });
      return;
    }

    this.add.text(720, 124, `CONCEPT ${currentNumber} / 02`, {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold",
      color: "#f8e2a8",
    }).setOrigin(1, 0);

    this.add.text(270, 157, this.lesson.boardTitle, {
      fontFamily: "Arial, sans-serif", fontSize: "24px", fontStyle: "bold",
      color: "#fff2cf", wordWrap: { width: 440 },
    });
    this.add.text(270, 205, this.lesson.boardIntro, {
      fontFamily: "Arial, sans-serif", fontSize: "15px", color: "#f7f1e2",
      lineSpacing: 5, wordWrap: { width: 445 },
    });

    this.add.text(270, 272, "REMEMBER", {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold",
      color: "#f3cf82", letterSpacing: 1,
    });
    const bullets = this.lesson.keyPoints.map((point) => `•  ${point}`).join("\n");
    this.add.text(270, 294, bullets, {
      fontFamily: "Arial, sans-serif", fontSize: "13px", color: "#fff5dd",
      lineSpacing: 4, wordWrap: { width: 445 },
    });

    // Story prompt card beneath the board.
    g.fillStyle(0xf8f0dc, 1).lineStyle(2, 0x526c53, 1)
      .fillRoundedRect(230, 474, 540, 96, 12).strokeRoundedRect(230, 474, 540, 96, 12);
    this.add.text(250, 487, this.lesson.storyTitle.toUpperCase(), {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold",
      color: "#36543d", letterSpacing: 1,
    });
    this.add.text(250, 510, this.lesson.storyIntro, {
      fontFamily: "Arial, sans-serif", fontSize: "13px", color: "#39483c",
      lineSpacing: 3, wordWrap: { width: 500 },
    });

    this.createButton(805, 583, 170, 48, "START CITY TASK  →", () => this.startCityTask());
    this.add.text(28, 590, "CONTROLS", {
      fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold", color: "#38563f",
    });
    this.add.text(28, 608, "[W A S D] / [ARROWS]  MOVE\n[E]  TALK / INTERACT", {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#263f31",
      lineSpacing: 5,
    });
  }

  drawClassroomCharacters() {
    if (!this.textures.exists("phishville_character_idle")) return;
    if (!this.anims.exists("character_idle_0")) {
      for (let row = 0; row < 5; row++) {
        this.anims.create({
          key: `character_idle_${row}`,
          frames: this.anims.generateFrameNumbers("phishville_character_idle", {
            start: row * 8,
            end: row * 8 + 7,
          }),
          frameRate: 5,
          repeat: -1,
        });
      }
    }

    // Teacher at the front of the room and the player's avatar at a desk.
    this.add.ellipse(148, 455, 45, 13, 0x3d4438, 0.2);
    const teacher = this.add.sprite(148, 450, "phishville_character_idle", 0)
      .setOrigin(0.5, 0.93).setScale(CHARACTER_SCALE).setTint(0x9bd8bf);
    teacher.play("character_idle_0");
    this.add.text(148, 402, "MS. BYTE  •  TEACHER", {
      fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold",
      color: "#244a37", backgroundColor: "#fff6df", padding: { x: 7, y: 4 },
    }).setOrigin(0.5);

    this.add.ellipse(710, 510, 36, 11, 0x3d4438, 0.18);
    const student = this.add.sprite(710, 505, "phishville_character_idle", 0)
      .setOrigin(0.5, 0.93).setScale(0.09).setTint(0xffe0b4);
    student.play("character_idle_0");
    this.add.text(710, 468, "YOU", {
      fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold",
      color: "#294b38", backgroundColor: "#fff6df", padding: { x: 6, y: 3 },
    }).setOrigin(0.5);
  }

  drawProgressRail() {
    const g = this.add.graphics();
    g.fillStyle(0xf7f0dd, 0.96).lineStyle(2, 0x526d53, 1)
      .fillRoundedRect(18, 22, 176, 130, 12).strokeRoundedRect(18, 22, 176, 130, 12);
    this.add.text(32, 34, "STUDY PATH", {
      fontFamily: "Arial, sans-serif", fontSize: "12px", fontStyle: "bold",
      color: "#35533d", letterSpacing: 1,
    });
    STUDY_LESSONS.forEach((lesson, index) => {
      const done = this.completedConcepts.includes(lesson.id);
      const active = this.lesson?.id === lesson.id;
      const y = 62 + index * 34;
      this.add.circle(42, y + 7, 8, done ? 0x5c9a68 : active ? 0xd49b42 : 0xb5b5a2);
      this.add.text(58, y, `${done ? "✓" : active ? "NOW" : "NEXT"}  ${lesson.number}. ${lesson.id === "phishing" ? "Phishing" : "UPI / OTP"}`, {
        fontFamily: "Arial, sans-serif", fontSize: "11px", fontStyle: "bold",
        color: active ? "#294b38" : "#75806f",
      });
    });
  }

  createButton(x, y, width, height, label, callback) {
    const bg = this.add.rectangle(x, y, width, height, 0x315940, 1)
      .setStrokeStyle(2, 0x203c2b, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: "Arial, sans-serif", fontSize: "13px", fontStyle: "bold",
      color: "#fff7e3",
    }).setOrigin(0.5);
    bg.on("pointerover", () => bg.setFillStyle(0x47764f, 1));
    bg.on("pointerout", () => bg.setFillStyle(0x315940, 1));
    bg.on("pointerdown", callback);
  }

  startCityTask() {
    if (!this.lesson) return;
    this.registry.set("studyCurrentLessonId", this.lesson.id);
    this.registry.set("studyMissionStep", 0);
    this.scene.start("CityScene", {
      studyMode: true,
      lessonId: this.lesson.id,
      stepIndex: 0,
    });
  }
}
