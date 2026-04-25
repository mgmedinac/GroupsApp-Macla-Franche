package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

func main() {
	chatAddr := flag.String("chat-addr", "localhost:50051", "ChatService gRPC address")
	groupID := flag.Int64("group-id", 101, "Group ID to use in test")
	userID := flag.Int64("user-id", 1, "User ID to use in test")
	content := flag.String("content", "mensaje de prueba gRPC", "Message content")
	timeout := flag.Duration("timeout", 5*time.Second, "Per-request timeout")
	simulateError := flag.Bool("simulate-error", true, "Send an invalid request to show gRPC error handling")
	flag.Parse()

	log.Printf("[1/5] Connecting to ChatService at %s", *chatAddr)
	dialCtx, cancelDial := context.WithTimeout(context.Background(), *timeout)
	defer cancelDial()

	conn, err := grpc.DialContext(
		dialCtx,
		*chatAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		log.Fatalf("connection failed: %v", err)
	}
	defer conn.Close()
	log.Println("connection established")

	client := groupsappv1.NewChatServiceClient(conn)

	log.Printf("[2/5] Sending SendMessage request: group_id=%d user_id=%d", *groupID, *userID)
	sendReq := &groupsappv1.SendMessageRequest{
		GroupId: *groupID,
		UserId:  *userID,
		Content: *content,
	}
	ctxSend, cancelSend := context.WithTimeout(context.Background(), *timeout)
	sendResp, err := client.SendMessage(ctxSend, sendReq)
	cancelSend()
	if err != nil {
		handleRPCError("SendMessage", err)
	}

	if sendResp.GetMessage() == nil {
		log.Fatalf("SendMessage returned success but message is nil")
	}
	log.Printf("response received: message_id=%d status=%s", sendResp.GetMessage().GetId(), sendResp.GetMessage().GetStatus())

	log.Printf("[3/5] Sending GetMessages request: group_id=%d", *groupID)
	getReq := &groupsappv1.GetMessagesRequest{GroupId: *groupID}
	ctxGet, cancelGet := context.WithTimeout(context.Background(), *timeout)
	getResp, err := client.GetMessages(ctxGet, getReq)
	cancelGet()
	if err != nil {
		handleRPCError("GetMessages", err)
	}

	if len(getResp.GetMessages()) == 0 {
		log.Fatalf("GetMessages returned empty list")
	}

	found := false
	for _, msg := range getResp.GetMessages() {
		if msg.GetId() == sendResp.GetMessage().GetId() {
			found = true
			break
		}
	}
	if !found {
		log.Fatalf("GetMessages did not include the message sent in this test")
	}

	log.Printf("response received: total_messages=%d includes_sent_message=true", len(getResp.GetMessages()))
	fmt.Println("end-to-end gRPC validation passed")

	if *simulateError {
		log.Println("[4/5] Simulating invalid request for error handling demo")
		badReq := &groupsappv1.SendMessageRequest{GroupId: 0, UserId: *userID, Content: ""}
		ctxBad, cancelBad := context.WithTimeout(context.Background(), *timeout)
		_, err := client.SendMessage(ctxBad, badReq)
		cancelBad()
		if err == nil {
			log.Println("warning: expected an error for invalid request, got nil")
		} else {
			st, ok := status.FromError(err)
			if ok {
				log.Printf("expected gRPC error received: code=%s message=%s", st.Code(), st.Message())
			} else {
				log.Printf("expected error received (non-gRPC): %v", err)
			}
		}
	}

	log.Println("[5/5] Done")
}

func handleRPCError(method string, err error) {
	if st, ok := status.FromError(err); ok {
		log.Fatalf("%s failed: code=%s message=%s", method, st.Code(), st.Message())
	}
	log.Fatalf("%s failed: %v", method, err)
}
