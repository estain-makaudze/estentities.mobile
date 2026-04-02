import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const MESSAGE_LOG_KEY = "loan_message_log_v1";

export type MessageType = "acknowledgement" | "reminder" | "broadcast" | "general";
export type DeliveryStatus = "sent" | "delivered" | "failed" | "pending";

export interface SentMessage {
  id: string;
  invoiceId: number | null;
  invoiceName: string | null;
  scheduleLineId: number | null;
  recipientName: string;
  recipientPhone: string;
  messageContent: string;
  messageType: MessageType;
  sentAt: string; // ISO timestamp
  deliveryStatus: DeliveryStatus;
  twilioSid: string | null;
  errorMessage: string | null;
}

interface MessageContextValue {
  messages: SentMessage[];
  isLoaded: boolean;
  addMessage: (msg: Omit<SentMessage, "id" | "sentAt">) => Promise<SentMessage>;
  updateMessageStatus: (id: string, status: DeliveryStatus, errorMessage?: string | null) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const MessageContext = createContext<MessageContextValue>({
  messages: [],
  isLoaded: false,
  addMessage: async () => { throw new Error("MessageProvider not initialized"); },
  updateMessageStatus: async () => {},
  removeMessage: async () => {},
  clearAll: async () => {},
});

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadMessages(): Promise<SentMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(MESSAGE_LOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SentMessage[];
  } catch {
    return [];
  }
}

async function saveMessages(msgs: SentMessage[]): Promise<void> {
  await AsyncStorage.setItem(MESSAGE_LOG_KEY, JSON.stringify(msgs));
}

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadMessages()
      .then(setMessages)
      .finally(() => setIsLoaded(true));
  }, []);

  const addMessage = useCallback(async (msg: Omit<SentMessage, "id" | "sentAt">): Promise<SentMessage> => {
    const newMsg: SentMessage = {
      ...msg,
      id: generateId(),
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => {
      const next = [newMsg, ...prev];
      saveMessages(next).catch(() => {});
      return next;
    });
    return newMsg;
  }, []);

  const updateMessageStatus = useCallback(async (id: string, status: DeliveryStatus, errorMessage?: string | null) => {
    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === id ? { ...m, deliveryStatus: status, errorMessage: errorMessage ?? m.errorMessage } : m
      );
      saveMessages(next).catch(() => {});
      return next;
    });
  }, []);

  const removeMessage = useCallback(async (id: string) => {
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveMessages(next).catch(() => {});
      return next;
    });
  }, []);

  const clearAll = useCallback(async () => {
    setMessages([]);
    await AsyncStorage.removeItem(MESSAGE_LOG_KEY);
  }, []);

  return (
    <MessageContext.Provider value={{ messages, isLoaded, addMessage, updateMessageStatus, removeMessage, clearAll }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessages() {
  return useContext(MessageContext);
}
