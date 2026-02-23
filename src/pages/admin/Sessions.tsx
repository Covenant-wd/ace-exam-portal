import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Session {
  id: string;
  name: string;
  is_active: boolean;
}

interface Term {
  id: string;
  session_id: string;
  name: string;
  is_active: boolean;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);

  // Session dialog
  const [sessionOpen, setSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [saving, setSaving] = useState(false);

  // Term dialog
  const [termOpen, setTermOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [termName, setTermName] = useState("");
  const [termSessionId, setTermSessionId] = useState("");

  // Track expanded sessions
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    const [sessRes, termsRes] = await Promise.all([
      supabase.from("sessions").select("*").order("created_at", { ascending: false }),
      supabase.from("terms").select("*").order("created_at"),
    ]);
    setSessions(sessRes.data ?? []);
    setTerms(termsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveSession = async () => {
    if (!sessionName.trim()) { toast.error("Session name is required"); return; }
    setSaving(true);
    if (editingSession) {
      const { error } = await supabase.from("sessions").update({ name: sessionName }).eq("id", editingSession.id);
      if (error) toast.error(error.message); else toast.success("Session updated");
    } else {
      const { error } = await supabase.from("sessions").insert({ name: sessionName });
      if (error) toast.error(error.message); else toast.success("Session created");
    }
    setSaving(false); setSessionOpen(false); fetchData();
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Delete this session and all its terms?")) return;
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchData(); }
  };

  const toggleActiveSession = async (s: Session) => {
    // Deactivate all, then activate selected
    if (!s.is_active) {
      await supabase.from("sessions").update({ is_active: false }).neq("id", "");
    }
    await supabase.from("sessions").update({ is_active: !s.is_active }).eq("id", s.id);
    fetchData();
  };

  const handleSaveTerm = async () => {
    if (!termName.trim()) { toast.error("Term name is required"); return; }
    setSaving(true);
    if (editingTerm) {
      const { error } = await supabase.from("terms").update({ name: termName }).eq("id", editingTerm.id);
      if (error) toast.error(error.message); else toast.success("Term updated");
    } else {
      const { error } = await supabase.from("terms").insert({ name: termName, session_id: termSessionId });
      if (error) toast.error(error.message); else toast.success("Term created");
    }
    setSaving(false); setTermOpen(false); fetchData();
  };

  const handleDeleteTerm = async (id: string) => {
    if (!confirm("Delete this term?")) return;
    const { error } = await supabase.from("terms").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchData(); }
  };

  const toggleActiveTerm = async (t: Term) => {
    if (!t.is_active) {
      // Deactivate all terms in the same session
      await supabase.from("terms").update({ is_active: false }).eq("session_id", t.session_id);
    }
    await supabase.from("terms").update({ is_active: !t.is_active }).eq("id", t.id);
    fetchData();
  };

  const openNewSession = () => { setEditingSession(null); setSessionName(""); setSessionOpen(true); };
  const openEditSession = (s: Session) => { setEditingSession(s); setSessionName(s.name); setSessionOpen(true); };
  const openNewTerm = (sessionId: string) => { setEditingTerm(null); setTermName(""); setTermSessionId(sessionId); setTermOpen(true); };
  const openEditTerm = (t: Term) => { setEditingTerm(t); setTermName(t.name); setTermSessionId(t.session_id); setTermOpen(true); };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Sessions & Terms</h1>
        <Button onClick={openNewSession}><Plus className="mr-2 h-4 w-4" />New Session</Button>
      </div>

      {sessions.length === 0 ? (
        <Card className="border-0 shadow-md"><CardContent className="p-8 text-center text-muted-foreground">No sessions yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const sessionTerms = terms.filter((t) => t.session_id === s.id);
            const isOpen = expanded[s.id] ?? false;
            return (
              <Card key={s.id} className="border-0 shadow-md">
                <Collapsible open={isOpen} onOpenChange={(o) => setExpanded((p) => ({ ...p, [s.id]: o }))}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          {s.name}
                        </CardTitle>
                        {s.is_active && <Badge>Active</Badge>}
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => toggleActiveSession(s)}>
                          {s.is_active ? "Deactivate" : "Set Active"}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditSession(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteSession(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">{sessionTerms.length} term{sessionTerms.length !== 1 ? "s" : ""}</p>
                        <Button variant="outline" size="sm" onClick={() => openNewTerm(s.id)}><Plus className="mr-1 h-3 w-3" />Add Term</Button>
                      </div>
                      {sessionTerms.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Term Name</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessionTerms.map((t) => (
                              <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.name}</TableCell>
                                <TableCell>
                                  <Badge variant={t.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleActiveTerm(t)}>
                                    {t.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="icon" onClick={() => openEditTerm(t)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteTerm(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Session dialog */}
      <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSession ? "Edit Session" : "New Session"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Session Name</Label><Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. 2024/2025 Academic Session" /></div>
            <Button onClick={handleSaveSession} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingSession ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Term dialog */}
      <Dialog open={termOpen} onOpenChange={setTermOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTerm ? "Edit Term" : "New Term"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Term Name</Label><Input value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="e.g. First Term" /></div>
            <Button onClick={handleSaveTerm} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTerm ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
