import { TextStyle } from "react-native";
import { NotificationData } from "./types";
import { settings } from "./config";

// メインメッセージのスタイル（通知タイプに応じて切り替え）
export const getMainTextStyle =
    (notification?: NotificationData): TextStyle =>
        notification
            ? {
                fontFamily: settings[notification.type].font,
                fontSize: settings[notification.type].fontSize,
                lineHeight: 1.5 * settings[notification.type].fontSize,
                fontWeight: settings[
                    notification.type
                ].fontWeight.toString() as TextStyle["fontWeight"],
                color: settings[notification.type].fontColor,
            }
            : {};

// サブメッセージ（本文）のスタイル（寄付系のみ表示）
export const getSubMessageStyle =
    (notification?: NotificationData): TextStyle =>
        notification?.type === "donation" || notification?.type === "superchat"
            ? {
                fontFamily: settings[notification.type].message.font,
                fontSize: settings[notification.type].message.fontSize,
                lineHeight: 1.5 * settings[notification.type].message.fontSize,
                fontWeight: settings[
                    notification.type
                ].message.fontWeight.toString() as TextStyle["fontWeight"],
                color: settings[notification.type].message.fontColor,
            }
            : {};