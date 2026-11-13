import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import CityScene from "./scenes/CityScene";
import ClassroomScene from "./scenes/ClassroomScene";

export default function Game({ mode = "story" }) {
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameRef.current) return undefined;

    const isStudyMode = mode === "study";
    const sceneList = isStudyMode
      ? [ClassroomScene, CityScene]
      : [CityScene];

    const config = {
      type: Phaser.AUTO,
      parent: "phishville-game",
      width: 1000,
      height: 650,
      backgroundColor: "#a8c9a0",
      scene: sceneList,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    const game = new Phaser.Game(config);
    game.registry.set("phishvilleMode", isStudyMode ? "study" : "story");
    game.registry.set("studyCompletedConcepts", []);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode]);

  return <div id="phishville-game" style={{ width: "100%", height: "100%" }} />;
}
