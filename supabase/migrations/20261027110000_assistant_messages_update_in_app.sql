-- Allow owners to update their in-app assistant messages (e.g. feedback in metadata).
CREATE POLICY assistant_messages_update_in_app
  ON public.assistant_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.channel = 'in_app'
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.assistant_conversations c
      WHERE c.id = conversation_id
        AND c.channel = 'in_app'
        AND c.user_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.assistant_messages.metadata IS
  'JSON metadata for UI components and client feedback (e.g. {"components":[],"feedback":"up"|"down"}).';
