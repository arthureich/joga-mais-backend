import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const region = "southamerica-east1";

async function getUserData(
  userId: string,
): Promise<{ name: string; tokens: string[] } | null> {
  try {
    const userDoc = await db.collection("usuarios").doc(userId).get();
    if (!userDoc.exists) {
      console.log(`Usuário ${userId} não encontrado.`);
      return null;
    }
    const userData = userDoc.data();
    const tokens = userData?.fcmTokens ?? []; 
    const name = userData?.nome ?? "Alguém"; 
    return { name, tokens };
  } catch (error) {
    console.error(`Erro ao buscar dados do usuário ${userId}:`, error);
    return null;
  }
}

async function sendNotification(
  tokens: string[],
  payload: admin.messaging.MessagingPayload,
) {
  if (!tokens || tokens.length === 0) {
    console.log("Nenhum token FCM válido encontrado para enviar.");
    return;
  }
  const uniqueTokens = [...new Set(tokens)];
  try {
    const response = await messaging.sendToDevice(uniqueTokens, payload);
    console.log(`Notificação enviada para ${response.successCount} tokens.`);
    response.results.forEach((result, index) => {
      const error = result.error;
      if (error) {
        console.error(
          "Falha ao enviar para token:",
          uniqueTokens[index],
          error,
        );
      }
    });
  } catch (error) {
    console.error("Erro ao enviar notificação:", error);
  }
}
// ============================================================================
// NOTIFICAÇÕES DE EVENTOS 
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
export const onUserJoinsEvent = functions
  .region(region)
  .firestore.document("eventos/{eventId}")
  .onUpdate(async (change, context) => {
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();

    if (!dataBefore || !dataAfter) {
      console.log("Dados ausentes.");
      return null;
    }
    const participantsBefore: string[] =
      dataBefore.participants?.map((p: any) => p.id) ?? [];
    const participantsAfter: string[] =
      dataAfter.participants?.map((p: any) => p.id) ?? [];
    if (participantsAfter.length <= participantsBefore.length) {
      console.log("Nenhum novo participante. (Provavelmente alguém saiu).");
      return null;
    }
    const newParticipantId = participantsAfter.find(
      (id: string) => !participantsBefore.includes(id),
    );
    if (!newParticipantId) {
      console.log("Não foi possível encontrar o novo participante.");
      return null;
    }
    const organizerId = dataAfter.organizer?.id; 
    if (!organizerId) {
      console.log("Evento não tem organizador.");
      return null;
    }
    const organizerData = await getUserData(organizerId);
    if (!organizerData) return null;
    const newParticipantData = await getUserData(newParticipantId);
    const newParticipantName = newParticipantData?.name ?? "Alguém";
    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Novo participante no seu evento!",
        body:
          `${newParticipantName} entrou no seu evento ` +
          `"${dataAfter.title}".`,
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
      data: {
        screen: "eventDetail",
        eventId: context.params.eventId,
      },
    };
    return sendNotification(organizerData.tokens, payload);
  });

// ============================================================================
// NOTIFICAÇÕES DE EVENTOS (PRIVADOS) 

export const onEventRequest = functions
  .region(region)
  .firestore.document("eventos/{eventId}")
  .onUpdate(async (change, context) => {
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();
    const pendingBefore: string[] = dataBefore?.pendingParticipants ?? []; 
    const pendingAfter: string[] = dataAfter?.pendingParticipants ?? [];
    if (pendingAfter.length <= pendingBefore.length) {
      return null; 
    }
    const newRequesterId = pendingAfter.find(
      (id: string) => !pendingBefore.includes(id),
    );
    if (!newRequesterId) return null;
    const organizerId = dataAfter.organizer?.id;
    if (!organizerId) return null;
    const [organizerData, requesterData] = await Promise.all([
      getUserData(organizerId),
      getUserData(newRequesterId),
    ]);
    if (!organizerData) return null;
    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Nova solicitação de entrada!",
        body:
          `${requesterData?.name ?? "Alguém"} quer entrar no seu evento ` +
          `"${dataAfter.title}".`,
      },
      data: {
        screen: "eventDetail", 
        eventId: context.params.eventId,
      },
    };
    return sendNotification(organizerData.tokens, payload);
  });
export const onEventRequestApproved = functions
  .region(region)
  .firestore.document("eventos/{eventId}")
  .onUpdate(async (change, context) => {
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();
    const pendingBefore: string[] = dataBefore?.pendingParticipants ?? [];
    const pendingAfter: string[] = dataAfter?.pendingParticipants ?? [];
    const participantsBefore: string[] =
      dataBefore.participants?.map((p: any) => p.id) ?? [];
    const participantsAfter: string[] =
      dataAfter.participants?.map((p: any) => p.id) ?? [];
    const approvedUserId = pendingBefore.find(
      (id: string) =>
        !pendingAfter.includes(id) && 
        !participantsBefore.includes(id) && 
        participantsAfter.includes(id), 
    );
    if (!approvedUserId) return null; 
    const approvedUserData = await getUserData(approvedUserId);
    if (!approvedUserData) return null;
    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Você foi aprovado! 🎉",
        body: `Sua solicitação para o evento "${dataAfter.title}" foi aceita!`,
      },
      data: {
        screen: "eventDetail",
        eventId: context.params.eventId,
      },
    };
    return sendNotification(approvedUserData.tokens, payload);
  });
export const onEventCancelled = functions
  .region(region)
  .firestore.document("eventos/{eventId}")
  .onDelete(async (snap, context) => {
    const dataBefore = snap.data();
    const participants: any[] = dataBefore?.participants ?? [];
    const participantIds: string[] = participants.map((p: any) => p.id);
    if (participantIds.length === 0) {
      return null; 
    }
    const userDocs = await Promise.all(
      participantIds.map((id) => db.collection("usuarios").doc(id).get()),
    );
    const allTokens = userDocs
      .map((doc) => doc.data()?.fcmTokens) 
      .flat() 
      .filter((token) => token); 
    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Evento Cancelado 😟",
        body:
          `O evento "${dataBefore.title}" em que você estava ` +
          "foi cancelado pelo organizador.",
      },
      data: {
        screen: "home", 
      },
    };
    return sendNotification(allTokens as string[], payload);
  });

// ============================================================================
// NOTIFICAÇÕES DE EQUIPES (PRIVADAS) 

export const onTeamRequest = functions
  .region(region)
  .firestore.document("equipes/{teamId}") 
  .onUpdate(async (change, context) => {
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();

    const pendingBefore: string[] = dataBefore?.pendingMemberIds ?? []; 
    const pendingAfter: string[] = dataAfter?.pendingMemberIds ?? [];

    if (pendingAfter.length <= pendingBefore.length) {
      return null; 
    }

    const newRequesterId = pendingAfter.find(
      (id: string) => !pendingBefore.includes(id),
    );
    if (!newRequesterId) return null;

    const adminId = dataAfter.adminId; 
    if (!adminId) return null;

    const [adminData, requesterData] = await Promise.all([
      getUserData(adminId),
      getUserData(newRequesterId),
    ]);

    if (!adminData) return null;

    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Nova solicitação de equipe!",
        body:
          `${requesterData?.name ?? "Alguém"} quer entrar na sua equipe ` +
          `"${dataAfter.name}".`,
      },
      data: {
        screen: "teamDetail", 
        teamId: context.params.teamId,
      },
    };

    return sendNotification(adminData.tokens, payload);
  });

export const onTeamRequestApproved = functions
  .region(region)
  .firestore.document("equipes/{teamId}")
  .onUpdate(async (change, context) => {
    const dataBefore = change.before.data();
    const dataAfter = change.after.data();

    const pendingBefore: string[] = dataBefore?.pendingMemberIds ?? [];
    const pendingAfter: string[] = dataAfter?.pendingMemberIds ?? [];
    const membersBefore: string[] = dataBefore?.memberIds ?? [];
    const membersAfter: string[] = dataAfter?.memberIds ?? [];

    const approvedUserId = pendingBefore.find(
      (id: string) =>
        !pendingAfter.includes(id) && 
        !membersBefore.includes(id) && 
        membersAfter.includes(id), 
    );

    if (!approvedUserId) return null; 

    const approvedUserData = await getUserData(approvedUserId);
    if (!approvedUserData) return null;

    const payload: admin.messaging.MessagingPayload = {
      notification: {
        title: "Bem-vindo à equipe! 🏆",
        body: `Sua solicitação para a equipe "${dataAfter.name}" foi aceita!`,
      },
      data: {
        screen: "teamDetail",
        teamId: context.params.teamId,
      },
    };

    return sendNotification(approvedUserData.tokens, payload);
  });